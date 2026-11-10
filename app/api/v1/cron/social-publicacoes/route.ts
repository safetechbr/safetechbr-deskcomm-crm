/**
 * Entrega as publicações agendadas das redes sociais, respeitando as regras de segurança
 * (limite diário, intervalo e lote). Roda a cada minuto. A lógica está em
 * `lib/channels/social/entrega.ts`; aqui só autoriza, executa e audita.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { entregarVencidas } from "@/lib/channels/social/entrega";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  let r;
  try {
    r = await entregarVencidas(createAdminClient());
  } catch (e) {
    logger.error("[social-publicacoes] rodada falhou", {
      error: e instanceof Error ? e.message : "erro",
      requestId,
    });
    return fail("internal_error", "Falha ao entregar as publicações.", 500, { requestId });
  }

  // Rodada sem efeito não audita (CLAUDE.md §Audit log).
  for (const [organizationId, x] of r.porOrganizacao) {
    if (x.entregues > 0) {
      await audit({
        action: "channel.social_publicacao_entregue",
        organizationId,
        resourceType: "social_publicacoes",
        requestId,
        metadata: { entregues: x.entregues },
      });
    }
    if (x.falharam > 0) {
      await audit({
        action: "channel.social_publicacao_falhou",
        organizationId,
        resourceType: "social_publicacoes",
        requestId,
        metadata: { falharam: x.falharam },
      });
    }
  }

  return ok(
    {
      entregues: r.entregues,
      adiadas: r.adiadas,
      falharam: r.falharam,
      interrompidas: r.interrompidas,
    },
    { requestId },
  );
}

export const GET = handle;
export const POST = handle;
