/**
 * POST /api/v1/renave/testar — testa a chave e o vínculo do CNPJ na integradora.
 * Não muda nada no RENAVE; audita porque usa a chave da loja contra terceiro.
 */
import { randomUUID } from "node:crypto";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { carregarConfig, mensagemDoErro } from "@/lib/renave/servico";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST() {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "renave" });
  if (!authz.ok) return authz.response;
  const org = authz.org.orgId;
  const cfg = await carregarConfig(createAdminClient(), org);
  if (!cfg) return fail("validation_failed", "Salve a chave de API do RENAVE antes de testar.", 422, { requestId });
  try {
    const est = await cfg.integracao.verificarEstabelecimento(cfg.cnpj);
    await audit({ organizationId: org, actorUserId: authz.user.id, action: "renave.conexao_testada",
      resourceType: "renave_integracoes", resourceId: cfg.id, requestId, metadata: { ...est } });
    const pronto = est.cadastrado && est.confirmado && est.vinculado;
    const mensagem = pronto ? "Conexão OK: loja cadastrada, confirmada e vinculada."
      : !est.cadastrado ? "A chave funciona, mas a loja ainda não está cadastrada no RENAVE."
      : !est.confirmado ? "A loja está cadastrada, mas o cadastro ainda não foi confirmado no RENAVE."
      : "A loja não está vinculada à sua conta na Renave Fácil.";
    return ok({ ...est, pronto, mensagem }, { requestId });
  } catch (e) {
    return fail("upstream_error", mensagemDoErro(e), 502, { requestId });
  }
}
