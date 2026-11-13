import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";

const schema = z.object({
  senha: z
    .string()
    .min(8)
    .refine((s) => Buffer.byteLength(s, "utf8") <= 72),
});

export async function GET() {
  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "settings" });
  if (!auth.ok) return auth.response;
  const { data, error } = await createAdminClient()
    .from("atendimento_senhas")
    .select("updated_at")
    .eq("organization_id", auth.org.orgId)
    .maybeSingle();
  if (error)
    return fail("internal_error", "Não foi possível consultar a configuração.", 500, { requestId });
  return ok({ configurada: !!data, atualizada_em: data?.updated_at ?? null }, { requestId });
}

export async function PUT(req: NextRequest) {
  const requestId = randomUUID();
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const auth = await requireRole("admin", { requestId, resource: "settings" });
  if (!auth.ok) return auth.response;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return fail(
      "validation_failed",
      "Use uma senha de pelo menos 8 caracteres e até 72 bytes.",
      422,
      { requestId },
    );
  const { error } = await createAdminClient().rpc("fn_atendimento_definir_senha", {
    p_org: auth.org.orgId,
    p_actor: auth.user.id,
    p_senha: body.data.senha,
  });
  if (error) return fail("internal_error", "Não foi possível salvar a senha.", 500, { requestId });
  await audit({
    action: "settings.atendimento_senha_changed",
    actorUserId: auth.user.id,
    organizationId: auth.org.orgId,
    resourceType: "organization",
    resourceId: auth.org.orgId,
    requestId,
  });
  return ok({ configurada: true }, { requestId });
}
