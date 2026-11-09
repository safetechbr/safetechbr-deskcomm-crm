import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import {
  apagarSobrasDeCanaisRemovidos,
  listarSobrasDeCanaisRemovidos,
} from "@/lib/channels/conversas-de-canais-removidos";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Conversas que ficaram de canais JÁ REMOVIDOS (arquivados).
 *
 * GET    — quantas são, por canal (a prévia que a tela mostra antes do clique).
 * DELETE — apaga só essas, com `{ "confirmar": true }` no corpo. Canal vivo,
 *          pausado ou desconectado nunca entra. Sem desfazer: por isso a
 *          confirmação explícita e o MFA.
 *
 * Admin only. A organização vem da sessão, nunca do corpo.
 */
export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channel_sessions", allowPlatformAdmin: "leitura" });
  if (!authz.ok) return authz.response;
  try {
    const canais = await listarSobrasDeCanaisRemovidos(createAdminClient(), authz.org.orgId);
    return ok(
      {
        canais,
        total_conversas: canais.reduce((s, c) => s + c.conversas, 0),
        total_mensagens: canais.reduce((s, c) => s + c.mensagens, 0),
      },
      { requestId },
    );
  } catch (err) {
    logger.error("[conversas-removidas] leitura falhou", { requestId, detail: err instanceof Error ? err.message : "erro" });
    return fail("internal_error", "Não foi possível ler as conversas dos canais removidos.", 500, { requestId });
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channel_sessions", allowPlatformAdmin: true });
  if (!authz.ok) return authz.response;
  if (await mfaEmDivida()) return fail("mfa_required", "Confirme a verificação em duas etapas.", 403, { requestId });

  const corpo = (await req.json().catch(() => null)) as { confirmar?: unknown } | null;
  if (corpo?.confirmar !== true) {
    return fail("validation_failed", "Confirme a exclusão para continuar.", 422, { requestId });
  }

  try {
    const feito = await apagarSobrasDeCanaisRemovidos(createAdminClient(), authz.org.orgId);
    void audit({
      action: "channel.removed_conversations_deleted",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "channel_session",
      resourceId: null,
      requestId,
      metadata: { canais: feito.canais, ...feito.total },
    });
    return ok(feito, { requestId });
  } catch (err) {
    logger.error("[conversas-removidas] exclusão falhou", { requestId, detail: err instanceof Error ? err.message : "erro" });
    return fail("internal_error", "Não foi possível excluir as conversas. Tente novamente.", 500, { requestId });
  }
}
