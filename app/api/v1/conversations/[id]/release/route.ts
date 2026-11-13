import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/conversations/[id]/release — atendente solta a conversa que
 * havia assumido. Volta status='open' e limpa assignee.
 *
 * Só funciona se o caller for o atual `assigned_to_user_id` (filtro no
 * UPDATE). RLS adiciona isolamento de tenant.
 *
 * G3-01: a mudança de dono acontece via rpc `fn_conversation_assign`
 * (migration 0031) — UPDATE condicional + evento `reason='release'` em
 * `conversation_assignment_events` na MESMA transação.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { alterarAtendimento } from "@/lib/atendimento/servidor";
import { ApiError } from "@/lib/api/types";
import { audit } from "@/lib/audit";
import { registrarTrocaDeComando } from "@/lib/inbox/atividade-de-comando";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import type { Conversation } from "@/lib/types/messaging";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  const supabase = await createClient();

  // spec 13 §4: escrita é agent+ (viewer é read-only).
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const user = authz.user;

  let conv: Conversation;
  try {
    const result = await alterarAtendimento({
      orgId: authz.org.orgId,
      actorId: user.id,
      conversationId: id,
      acao: "liberar",
    });
    if (!result.conversation)
      return fail("state_conflict", t("Você não está atribuído a essa conversa."), 409, {
        requestId,
      });
    conv = result.conversation;
  } catch (e) {
    if (e instanceof ApiError) return fail(e.code, e.message, e.status, { requestId });
    throw e;
  }

  await audit({
    action: "conversation.released",
    actorUserId: user.id,
    organizationId: conv.organization_id,
    resourceType: "conversation",
    resourceId: conv.id,
    requestId,
  });

  // Liberar devolve o comando ao automático desde a 0173 (a RPC limpa
  // `bot_silenced_until`), então a linha na timeline não é decoração: ela é o
  // registro de que o cliente voltou a ser atendido por máquina.
  await registrarTrocaDeComando({
    supabase,
    organizationId: conv.organization_id,
    conversationId: conv.id,
    contactId: conv.contact_id,
    tipo: "conversation_released",
    actor: { type: "user", id: user.id, role: authz.org.role },
    // Canônico em português: quem traduz é a LEITURA (`t(item.reason)`). Ver o
    // bloco "vocabulario de dominio persistido" em `lib/i18n/dicionario.ts`.
    motivo: "Liberou a conversa de volta para a fila",
  });

  return ok(conv, { requestId });
}
