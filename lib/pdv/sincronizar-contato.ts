/**
 * Mantém o contato igual ao que o vendedor digitou na negociação.
 *
 * A negociação guarda uma fotografia do cliente, mas o contato é o cadastro vivo.
 * Sem esta cópia, dados corrigidos direto na ficha da venda (ex.: CNH-e lida do PDF)
 * ficavam só na negociação e o contato continuava com a versão antiga.
 * Só valores preenchidos são copiados: campo vazio nunca apaga o cadastro.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { dadosCadastraisDoClienteSchema } from "@/lib/contacts/dados-cadastrais-do-cliente";
import type { ClienteDaNegociacao } from "@/lib/pdv/regras";

const CAMPOS_DO_CADASTRO = [
  "nacionalidade",
  "estado_civil",
  "profissao",
  "rg",
  "rg_orgao_expedidor",
  "rg_uf",
  "cnh",
  "endereco",
  "numero",
  "complemento",
  "bairro",
  "cep",
  "cidade",
  "uf",
] as const;

export async function sincronizarContatoComNegociacao(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
  cliente: Partial<ClienteDaNegociacao>,
): Promise<void> {
  const extras: Record<string, string> = {};
  for (const k of CAMPOS_DO_CADASTRO) {
    const v = cliente[k]?.trim();
    if (v) extras[k] = v;
  }
  const nascimento = (cliente.nascimento ?? "").trim();
  const temNascimento = /^\d{4}-\d{2}-\d{2}$/.test(nascimento);
  if (!Object.keys(extras).length && !temNascimento) return;

  const { data: contato } = await supabase
    .from("contacts")
    .select("custom_fields")
    .eq("organization_id", orgId)
    .eq("id", contactId)
    .maybeSingle();
  if (!contato) return;
  const custom = (contato.custom_fields ?? {}) as Record<string, unknown>;
  const anterior = dadosCadastraisDoClienteSchema.safeParse(custom.cadastro_cliente);
  const novo = dadosCadastraisDoClienteSchema.safeParse({
    ...(anterior.success ? anterior.data : {}),
    ...extras,
  });
  const patch: Record<string, unknown> = {};
  if (novo.success && Object.keys(extras).length)
    patch.custom_fields = { ...custom, cadastro_cliente: novo.data };
  if (temNascimento) patch.birthdate = nascimento;
  if (!Object.keys(patch).length) return;
  const { error } = await supabase
    .from("contacts")
    .update(patch)
    .eq("organization_id", orgId)
    .eq("id", contactId);
  if (error) console.warn("[pdv] contato não sincronizado com a negociação:", error.message);
}
