import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { emailDoLogin } from "@/lib/auth/login-vendedor";
import { criarVendedorSchema } from "@/lib/team/criar-vendedor";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit, isServiceRoleConfigured } from "@/lib/audit";
import { traduzirLimiteDoPlano } from "@/lib/cobranca/limites";
import { ok, fail } from "@/lib/api/wrappers";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const authz = await requireRole("admin", { requestId, resource: "team" });
  if (!authz.ok) return authz.response;
  const parsed = criarVendedorSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", parsed.error.issues[0]?.message ?? "Dados inválidos.", 422, { requestId });
  if (!isServiceRoleConfigured()) return fail("internal_error", "A criação de usuários não está configurada nesta instalação.", 503, { requestId });
  const input = parsed.data;
  const admin = createAdminClient();
  // Nunca vincular uma conta que já existe: a senha e a identidade pertencem ao
  // novo vendedor. A unicidade atômica do Auth recusa nomes repetidos.
  const { data, error } = await admin.auth.admin.createUser({
    email: emailDoLogin(input.username), password: input.password, email_confirm: true,
    ban_duration: "876000h",
    user_metadata: { full_name: input.full_name },
    app_metadata: { managed_by_organization: authz.org.orgId },
  });
  if (error || !data.user) {
    if (error?.code === "email_exists" || error?.code === "user_already_exists")
      return fail("state_conflict", "Este login já está em uso. Escolha outro nome de login.", 409, { requestId });
    return fail("validation_failed", "Não foi possível criar o acesso. Confira o login e use uma senha mais forte.", 422, { requestId });
  }
  const userId = data.user.id;
  // Mesma transação de vínculo, papel, interface e trava de assentos do convite.
  // A organização vem da sessão administrativa, nunca do formulário.
  const agora = new Date().toISOString();
  const { error: membershipError } = await admin.rpc("fn_accept_team_invite", {
    p_user: userId, p_org: authz.org.orgId, p_role: input.role,
    p_invited_by: authz.user.id, p_invited_at: agora, p_issued_at: agora,
    p_interface_settings: input.interface_settings,
  });
  if (membershipError) {
    // Compensação limitada à conta recém-criada, nunca a uma conta preexistente.
    const { error: cleanupError } = await admin.auth.admin.deleteUser(userId);
    if (cleanupError) {
      await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
      logger.error("team.create: falha ao remover conta incompleta", { user_id: userId, organization_id: authz.org.orgId, request_id: requestId });
    }
    const limite = traduzirLimiteDoPlano(membershipError, authz.user.idioma);
    if (limite) return fail(limite.code, limite.message, 409, { requestId, details: limite.details });
    return fail("internal_error", "Não foi possível concluir o cadastro do vendedor. Tente novamente.", 500, { requestId });
  }
  // A conta só entra depois de o vínculo estar completo. Uma interrupção entre
  // Auth e banco deixa um acesso bloqueado, nunca uma conta solta no onboarding.
  const { error: activationError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
  if (activationError) {
    await admin.auth.admin.deleteUser(userId);
    return fail("internal_error", "Não foi possível ativar o acesso. Confira a equipe antes de tentar novamente.", 500, { requestId });
  }
  await audit({ action: "member.created", actorUserId: authz.user.id, organizationId: authz.org.orgId,
    resourceType: "membership", resourceId: userId, metadata: { role: input.role, access_type: "username" }, requestId });
  return ok({ user_id: userId, username: input.username }, { status: 201, requestId });
}
