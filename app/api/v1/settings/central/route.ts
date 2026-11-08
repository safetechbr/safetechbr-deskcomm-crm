import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
const entrada = z.object({ pipeline_id: z.uuid() }).strict();
const documento = z.record(z.string(), z.unknown());

/** Preferência da central: não modifica is_default nem roteia novos negócios. */
export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "central_settings" });
  if (!authz.ok) return authz.response;
  const db = await createClient();
  const org = await db
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (org.error)
    return fail("internal_error", "Não consegui carregar a configuração da central.", 500, {
      requestId,
    });
  if (!org.data) return fail("not_found", "Organização não encontrada.", 404, { requestId });
  const settings = documento.safeParse(org.data.settings ?? {});
  const central = documento.safeParse(settings.success ? settings.data.central : null);
  const configurado = z.uuid().safeParse(central.success ? central.data.pipeline_id : null);
  if (configurado.success) {
    const escolhido = await db
      .from("crm_pipelines")
      .select("id, name")
      .eq("organization_id", authz.org.orgId)
      .eq("id", configurado.data)
      .eq("is_archived", false)
      .maybeSingle();
    if (escolhido.error)
      return fail("internal_error", "Não consegui carregar o funil principal.", 500, { requestId });
    if (escolhido.data)
      return ok({ pipeline: escolhido.data, substituido: false, configurado: true }, { requestId });
  }
  // Sem preferência, ou funil arquivado/excluído: usa um quadro vivo da empresa.
  const padrao = await db
    .from("crm_pipelines")
    .select("id, name")
    .eq("organization_id", authz.org.orgId)
    .eq("is_archived", false)
    .order("is_default", { ascending: false })
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (padrao.error)
    return fail("internal_error", "Não consegui carregar o funil principal.", 500, { requestId });
  return ok(
    { pipeline: padrao.data, substituido: configurado.success, configurado: false },
    { requestId },
  );
}

export async function PATCH(req: Request): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "central_settings" });
  if (!authz.ok) return authz.response;
  const parsed = entrada.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_failed", "Selecione um funil válido.", 422, { requestId });
  const db = await createClient();
  const funil = await db
    .from("crm_pipelines")
    .select("id, name")
    .eq("organization_id", authz.org.orgId)
    .eq("id", parsed.data.pipeline_id)
    .eq("is_archived", false)
    .maybeSingle();
  if (funil.error)
    return fail("internal_error", "Não consegui consultar o funil.", 500, { requestId });
  if (!funil.data)
    return fail("not_found", "Funil não encontrado ou arquivado.", 404, { requestId });
  // Organizations só permite escrita direta da plataforma; ID confiável e CAS,
  // como settings/agenda-apresentacao, para preservar configurações concorrentes.
  const admin = createAdminClient();
  const org = await admin
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (org.error)
    return fail("internal_error", "Não consegui carregar a configuração.", 500, { requestId });
  if (!org.data) return fail("not_found", "Organização não encontrada.", 404, { requestId });
  const settings = documento.safeParse(org.data.settings ?? {});
  const central = documento.safeParse(settings.success ? (settings.data.central ?? {}) : null);
  if (!settings.success || !central.success)
    return fail("conflict", "Confira a configuração da central.", 409, { requestId });
  let update = admin
    .from("organizations")
    .update({
      settings: {
        ...settings.data,
        central: { ...central.data, pipeline_id: parsed.data.pipeline_id },
      },
    })
    .eq("id", authz.org.orgId);
  update =
    org.data.settings === null
      ? update.is("settings", null)
      : update.filter("settings", "eq", JSON.stringify(org.data.settings));
  const saved = await update.select("id").maybeSingle();
  if (saved.error)
    return fail("internal_error", "Não consegui salvar o funil principal.", 500, { requestId });
  if (!saved.data)
    return fail("conflict", "A configuração mudou. Tente novamente.", 409, { requestId });
  void audit({
    action: "settings.central_pipeline_updated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "organization",
    resourceId: authz.org.orgId,
    requestId,
    metadata: { pipeline_id: funil.data.id },
  });
  return ok({ pipeline: funil.data, substituido: false, configurado: true }, { requestId });
}
