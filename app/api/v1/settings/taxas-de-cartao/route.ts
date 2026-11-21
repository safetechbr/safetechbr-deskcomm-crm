import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { taxasDeCartaoSchema } from "@/lib/pdv/taxas-de-cartao";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(req: NextRequest) {
  const negado = await requireSupportWrite();
  if (negado) return negado;
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "settings_taxas_de_cartao" });
  if (!authz.ok) return authz.response;

  const config = taxasDeCartaoSchema.safeParse(await req.json().catch(() => null));
  if (!config.success) return fail("validation_failed", "Confira os perfis e as taxas.", 422, { requestId });

  const orgId = authz.org.orgId;
  const supabase = createAdminClient();
  const { data: org, error: leitura } = await supabase.from("organizations")
    .select("settings").eq("id", orgId).single();
  if (leitura) return fail("internal_error", "Falha ao ler as configurações.", 500, { requestId });

  const alteracao = supabase.from("organizations")
    .update({ settings: { ...org.settings, taxas_de_cartao: config.data } }).eq("id", orgId);
  const { data, error } = await (org.settings === null
    ? alteracao.is("settings", null)
    : alteracao.eq("settings", JSON.stringify(org.settings))).select("id").maybeSingle();
  if (error) return fail("internal_error", "Falha ao salvar as taxas.", 500, { requestId });
  if (!data) return fail("conflict", "As configurações mudaram. Recarregue a página.", 409, { requestId });

  await audit({
    action: "org.updated",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "organization",
    resourceId: orgId,
    requestId,
    metadata: { fields_changed: ["taxas_de_cartao"] },
  });
  return ok(config.data, { requestId });
}
