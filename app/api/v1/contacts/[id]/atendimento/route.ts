import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { alterarAtendimento } from "@/lib/atendimento/servidor";
import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";
import { ApiError } from "@/lib/api/types";

const schema = z.object({
  acao: z.enum(["assumir", "liberar"]),
  senha: z.string().max(72).optional(),
  conversation_id: z.string().uuid().optional(),
  expected_assignee: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const auth = await requireRole("agent", { requestId, resource: "contacts" });
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success)
    return fail("validation_failed", "Confira os dados do atendimento.", 422, { requestId });
  try {
    // A conversa também deve pertencer ao contato indicado na URL.
    const { createAdminClient } = await import("@/lib/supabase/admin");
    if (body.data.conversation_id) {
      const { data } = await createAdminClient()
        .from("conversations")
        .select("id")
        .eq("organization_id", auth.org.orgId)
        .eq("contact_id", id)
        .eq("id", body.data.conversation_id)
        .maybeSingle();
      if (!data) return fail("not_found", "Conversa não encontrada.", 404, { requestId });
    }
    const result = await alterarAtendimento({
      orgId: auth.org.orgId,
      actorId: auth.user.id,
      contactId: id,
      conversationId: body.data.conversation_id,
      acao: body.data.acao,
      senha: body.data.senha,
      expected: body.data.expected_assignee,
    });
    await audit({
      action: `contact.atendimento_${body.data.acao}`,
      actorUserId: auth.user.id,
      organizationId: auth.org.orgId,
      resourceType: "contact",
      resourceId: id,
      requestId,
      metadata: {
        antes: result.antes,
        depois: result.dono_user_id,
        autorizado_por_senha: result.autorizado_por_senha,
      },
    });
    return ok(result, { requestId });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.code, e.message, e.status, { requestId });
    throw e;
  }
}
