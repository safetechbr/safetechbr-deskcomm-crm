/** POST /api/v1/renave/veiculos/:id/atualizar — consulta agora a situação do veículo no RENAVE. */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { atualizarStatus } from "@/lib/renave/servico";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "renave" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("validation_failed", "Veículo inválido.", 422, { requestId });
  const org = authz.org.orgId;
  const r = await atualizarStatus(createAdminClient(), org, id);
  if ("erro" in r) return fail("upstream_error", r.erro, 502, { requestId });
  if (r.mudou) {
    await audit({ organizationId: org, actorUserId: authz.user.id, action: "renave.situacao_mudou",
      resourceType: "veiculos", resourceId: id, requestId, metadata: { situacao: r.situacao, origem: "manual" } });
  }
  return ok(r, { requestId });
}
