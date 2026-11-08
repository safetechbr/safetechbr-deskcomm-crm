import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginDoEmail } from "@/lib/auth/login-vendedor";
import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";

export async function PATCH(req: NextRequest, context: { params: Promise<{ user_id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const authz = await requireRole("admin", { requestId, resource: "team" });
  if (!authz.ok) return authz.response;
  const id = z.string().uuid().safeParse((await context.params).user_id);
  const input = z.object({ password: z.string().min(8).max(128) }).safeParse(await req.json().catch(() => null));
  if (!id.success || !input.success) return fail("validation_failed", "Informe uma senha com pelo menos 8 caracteres.", 422, { requestId });
  const admin = createAdminClient();
  const { data: membro, error: memberError } = await admin.from("user_organizations").select("user_id")
    .eq("organization_id", authz.org.orgId).eq("user_id", id.data).is("revoked_at", null).maybeSingle();
  if (memberError) return fail("internal_error", "Não foi possível verificar o acesso.", 500, { requestId });
  if (!membro) return fail("not_found", "Vendedor não encontrado na equipe ativa.", 404, { requestId });
  const { data, error } = await admin.auth.admin.getUserById(id.data);
  if (error || !data.user || !loginDoEmail(data.user.email) || data.user.app_metadata.managed_by_organization !== authz.org.orgId)
    return fail("forbidden", "Só é possível definir a senha dos acessos criados por esta empresa.", 403, { requestId });
  const { error: updateError } = await admin.auth.admin.updateUserById(id.data, { password: input.data.password });
  if (updateError) return fail("validation_failed", "Não foi possível definir a senha. Use uma senha mais forte e tente novamente.", 422, { requestId });
  await audit({ action: "member.password_changed", actorUserId: authz.user.id, organizationId: authz.org.orgId,
    resourceType: "membership", resourceId: id.data, metadata: {}, requestId });
  return ok({ user_id: id.data }, { requestId });
}
