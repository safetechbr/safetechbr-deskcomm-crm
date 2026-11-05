/**
 * POST /api/v1/pacing/numero — um sistema externo (o PostPlan) coordena o ritmo de
 * envio de um número com o CRM, usando o MESMO `pacing_ledger`.
 *
 * Duas ações, sempre sobre uma sessão WAHA (`session_name`, única por organização):
 *  - `pedir`: devolve se dá para enviar agora (`liberado`) ou quando dá (`libera_em`).
 *  - `registrar`: grava um envio efetivado no ledger.
 *
 * A REGRA não é reescrita aqui: vem de `criarPacingDoCanal`. A consulta NÃO reserva
 * vaga — por isso o número deve ter um remetente por vez.
 *
 * Mesma porta e mesmo segredo de `/tenants/provision`: `TENANT_PROVISIONING_SECRET`
 * (>= 32 caracteres). Sem ele a rota responde 404. Só FALHAS de credencial contam no
 * limite por IP.
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { criarPacingDoCanal } from "@/lib/agent-engine/pacing/ledger-supabase";
import { checkRateLimit, peekRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { fail, ok } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { logger } from "@/lib/logger";
import { extractBearer } from "@/lib/mcp/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TAMANHO_MINIMO_DO_SEGREDO = 32;
const FALHAS_POR_MINUTO = 10;

const corpoSchema = z.object({
  session_name: z.string().min(1).max(200),
  action: z.enum(["pedir", "registrar"]),
});

function segredoDaInstalacao(): string | null {
  const segredo = env.TENANT_PROVISIONING_SECRET.trim();
  return segredo.length >= TAMANHO_MINIMO_DO_SEGREDO ? segredo : null;
}

function bearerConfere(req: NextRequest, esperado: string): boolean {
  const recebido = extractBearer(req.headers.get("authorization")) ?? "";
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const esperado = segredoDaInstalacao();
  if (!esperado) return fail("not_found", "Not found.", 404, { requestId });

  const ip = ipDoCliente(req.headers);
  const balde = ip === null ? null : `pacing_numero:falha:ip:${ip}`;
  const falhas = balde === null ? 0 : await peekRateLimit(balde, 60);
  if (balde !== null && falhas >= FALHAS_POR_MINUTO) {
    return fail("rate_limited", "Too many requests.", 429, {
      requestId,
      headers: { "Retry-After": "60" },
    });
  }
  if (!bearerConfere(req, esperado)) {
    if (balde !== null) await checkRateLimit(balde, FALHAS_POR_MINUTO, 60);
    return fail("unauthenticated", "Credencial inválida.", 401, { requestId });
  }

  const json = await req.json().catch(() => null);
  const corpo = corpoSchema.safeParse(json);
  if (!corpo.success) return fail("invalid_request", "Corpo inválido.", 400, { requestId });

  try {
    const admin = createAdminClient();
    const { data: sessao, error } = await admin
      .from("channel_sessions")
      .select("id, organization_id")
      .eq("waha_session_name", corpo.data.session_name)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sessao) return fail("not_found", "Sessão desconhecida.", 404, { requestId });

    const pacing = await criarPacingDoCanal(admin);
    const orgId = sessao.organization_id as string;
    const sessaoId = sessao.id as string;

    if (corpo.data.action === "registrar") {
      await pacing.registraEnvio(orgId, sessaoId, new Date());
      return ok({ registrado: true }, { requestId, headers: { "Cache-Control": "no-store" } });
    }

    const decisao = await pacing.decide(orgId, sessaoId, new Date());
    return ok(
      decisao.liberado
        ? { liberado: true }
        : { liberado: false, motivo: decisao.motivo, libera_em: decisao.liberaEm.toISOString() },
      { requestId, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    logger.error("[pacing.numero] falhou", {
      requestId,
      erro: err instanceof Error ? err.message : String(err),
    });
    return fail("internal_error", "Não foi possível consultar o ritmo.", 500, { requestId });
  }
}
