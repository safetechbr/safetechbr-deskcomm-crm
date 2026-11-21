/** Acesso server-side à config fiscal da loja, incluindo o token do provedor (cifrado no banco). */
import type { SupabaseClient } from "@supabase/supabase-js";
import { byteaToBuffer, decryptKey } from "@/lib/crypto/aes_gcm";
import type { ContextoProvider } from "./provider";

/** Colunas que a tela pode ler. Nunca inclui token nem segredo do webhook. */
export const COLUNAS_CONFIG_PUBLICAS =
  "id, organization_id, cnpj, razao_social, nome_fantasia, inscricao_estadual, inscricao_municipal, crt, cnae, " +
  "logradouro, numero, complemento, bairro, municipio, uf, cep, telefone, ambiente, serie_nfe, proximo_numero_nfe, " +
  "provider, provider_empresa_id, certificado_validade, certificado_enviado_em, email_contador, credenciado_sefaz, " +
  "regras_revisadas_em, nota_teste_ok_em, entrega_automatica, renave_ativo, ativo, created_at, updated_at";

export interface ConfigComContexto {
  config: Record<string, unknown>;
  ctx: ContextoProvider | null;
}

/** Só chamar com `orgId` vindo de sessão confiável ou de um registro do banco, nunca do corpo da requisição. */
export async function carregarConfigComContexto(admin: SupabaseClient, orgId: string): Promise<ConfigComContexto | null> {
  const { data } = await admin.from("config_fiscal_loja").select("*").eq("organization_id", orgId).limit(1).maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  let ctx: ContextoProvider | null = null;
  if (row.provider_token_cifrado && row.provider_token_iv && row.provider_token_tag && row.cnpj) {
    const token = decryptKey({
      ciphertext: byteaToBuffer(row.provider_token_cifrado as string),
      iv: byteaToBuffer(row.provider_token_iv as string),
      tag: byteaToBuffer(row.provider_token_tag as string),
    });
    ctx = { cnpj: String(row.cnpj), ambiente: row.ambiente === "producao" ? "producao" : "homologacao", token };
  }
  return { config: row, ctx };
}
