/**
 * POST /api/v1/fiscal/certificado — envia o e-CNPJ A1 da loja ao provedor.
 *
 * O .pfx e a senha só existem na memória desta requisição: vão direto ao
 * provedor e NUNCA são gravados nem logados. Aqui fica só o token que o
 * provedor devolve (cifrado, AES-256-GCM) e a validade.
 *
 * Validade: vem do corpo (`certificado_validade`, a data que o lojista lê no
 * certificado). A resposta da Focus não tem campo de validade confirmado, e
 * ler o .pfx aqui exigiria parsear o arquivo (e tocar a senha) no nosso lado.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { bufToBytea, encryptKey } from "@/lib/crypto/aes_gcm";
import { tokenRevendaFocus } from "@/lib/fiscal/focus/token-revenda";
import type { DadosEmpresa } from "@/lib/fiscal/provider";
import { FocusNfeProvider } from "@/lib/fiscal/focus/provider";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const schema = z.object({
  pfx_base64: z.string().min(100).max(200_000).regex(/^[A-Za-z0-9+/=\s]+$/),
  senha: z.string().min(1).max(200),
  certificado_validade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: NextRequest) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fiscal" });
  if (!authz.ok) return authz.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Number.isNaN(Date.parse(parsed.data.certificado_validade)))
    return fail("validation_failed", "Certificado, senha ou validade inválidos.", 422, { requestId });
  const tokenRevenda = await tokenRevendaFocus();
  if (!tokenRevenda)
    return fail("service_unavailable", "Provedor fiscal não configurado neste ambiente.", 503, { requestId });

  const org = authz.org.orgId;
  const admin = createAdminClient();
  const { data: c, error } = await admin.from("config_fiscal_loja").select("*").eq("organization_id", org).limit(1).maybeSingle();
  if (error) return fail("internal_error", "Não foi possível ler a configuração fiscal.", 500, { requestId });
  if (!c?.cnpj || !c.razao_social || !c.crt)
    return fail("conflict", "Preencha os dados da empresa antes de enviar o certificado.", 409, { requestId });

  const empresa: DadosEmpresa = {
    cnpj: c.cnpj, razaoSocial: c.razao_social, nomeFantasia: c.nome_fantasia,
    inscricaoEstadual: c.inscricao_estadual, inscricaoMunicipal: c.inscricao_municipal,
    crt: c.crt, cnae: c.cnae, logradouro: c.logradouro, numero: c.numero, complemento: c.complemento,
    bairro: c.bairro, municipio: c.municipio, uf: c.uf, cep: c.cep, telefone: c.telefone, email: c.email_contador,
  };
  let resultado;
  try {
    resultado = await new FocusNfeProvider({ tokenRevenda })
      .cadastrarEmpresa(empresa, { pfxBase64: parsed.data.pfx_base64, senha: parsed.data.senha });
  } catch (e) {
    // Só a mensagem do provedor: o corpo da requisição (pfx/senha) nunca entra no log.
    logger.warn("[fiscal/certificado] provedor recusou", { error: e instanceof Error ? e.message : "erro", requestId });
    return fail("upstream_error", e instanceof Error ? e.message : "O provedor recusou o certificado.", 502, { requestId });
  }
  if (!resultado.token)
    return fail("upstream_error", "O provedor não devolveu o acesso da empresa.", 502, { requestId });

  const enc = encryptKey(resultado.token);
  const { error: errSalvar } = await admin.from("config_fiscal_loja").update({
    provider_empresa_id: resultado.empresaId,
    provider_token_cifrado: bufToBytea(enc.ciphertext),
    provider_token_iv: bufToBytea(enc.iv),
    provider_token_tag: bufToBytea(enc.tag),
    certificado_validade: parsed.data.certificado_validade,
    certificado_enviado_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", c.id).eq("organization_id", org);
  if (errSalvar) {
    logger.error("[fiscal/certificado] salvar falhou", { error: errSalvar.message, requestId });
    return fail("internal_error", "Não foi possível salvar o certificado.", 500, { requestId });
  }
  await audit({ organizationId: org, actorUserId: authz.user.id, action: "fiscal.certificado_enviado",
    resourceType: "config_fiscal_loja", resourceId: c.id as string, requestId,
    metadata: { validade: parsed.data.certificado_validade } });
  return ok({ certificado_validade: parsed.data.certificado_validade }, { requestId });
}
