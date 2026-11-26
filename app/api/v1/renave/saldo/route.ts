/** GET /api/v1/renave/saldo — créditos da loja na integradora, com aviso de saldo baixo. */
import { randomUUID } from "node:crypto";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { carregarConfig, mensagemDoErro } from "@/lib/renave/servico";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "renave" });
  if (!authz.ok) return authz.response;
  const cfg = await carregarConfig(createAdminClient(), authz.org.orgId);
  if (!cfg) return fail("validation_failed", "Configure a chave de API do RENAVE primeiro.", 422, { requestId });
  try {
    const c = await cfg.integracao.consultarCreditos(cfg.cnpj);
    return ok({ seminovos: c.seminovos, zero_km: c.zeroKm, limite_aviso: cfg.limiteCreditosAviso,
      baixo: c.seminovos <= cfg.limiteCreditosAviso }, { requestId });
  } catch (e) {
    return fail("upstream_error", mensagemDoErro(e), 502, { requestId });
  }
}
