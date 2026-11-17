/**
 * PATCH /api/v1/oficina/:id — `{ custo_cents }` edita o custo de compra (manager+).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { custoPatchSchema } from "@/lib/oficina/regras";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "oficina" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await params;

  const parsed = custoPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("veiculos")
    .update({ custo_cents: parsed.data.custo_cents })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .select("id, custo_cents")
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao salvar o custo.", 500, { requestId });
  if (!data) return fail("not_found", t("Veículo não encontrado."), 404, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "veiculo.custo_updated",
    resourceType: "veiculos",
    resourceId: id,
    requestId,
  });
  return ok(data, { requestId });
}
