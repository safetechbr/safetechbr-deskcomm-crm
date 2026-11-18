/**
 * session-silencio-watcher — sessão WORKING que parou de receber.
 *
 * O `channel-health` só olha o STATUS da sessão, e uma sessão NOWEB "surda"
 * continua `WORKING` enquanto o envio funciona. Aqui a pergunta é outra: faz
 * tempo demais, em horário comercial, que não entra mensagem numa conta que
 * costuma receber? A regra mora em `lib/channels/silencio.ts` (pura, testada).
 *
 * Ao detectar: abre UM aviso na Central (dedup pelo aviso aberto da sessão) e
 * tenta reiniciar a sessão no transporte (`reiniciarSessao`), no máximo 1 vez a cada 30
 * min e 3 seguidas — esgotado, só avisa. NÃO reinicia sessão `FAILED`,
 * `SCAN_QR_CODE` ou `STOPPED` (só `WORKING`), nem com envio em andamento.
 * Fecha o aviso sozinho quando volta a entrar mensagem.
 *
 * Custo: por sessão WhatsApp, 1 leitura indexada da última entrada (+1 de
 * `messages` só quando há silêncio). Sem rede, exceto o restart.
 *
 * Estado das tentativas: `channel_sessions.metadata.silencio` (sem migration).
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { CHANNEL_SESSION_REF_COLUMNS, resolveSessionRef } from "@/lib/channels";
import { PROVIDER_REINICIAVEL, reiniciarSessao } from "@/lib/channels/reiniciar-sessao";
import { avaliarSilencio, SEM_REINICIOS, type EstadoDeReinicio } from "@/lib/channels/silencio";
import { ehNomeDeSessaoE2E } from "@/lib/channels/sessoes-e2e";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const LIMITE = 50;
const KIND = "channel_number_alert";
const TITULO = "WhatsApp conectado, mas sem receber mensagens";
/** Envio "sending" mais novo que isto conta como em andamento. */
const JANELA_DE_ENVIO_MS = 5 * 60 * 1000;

function corpo(silencioMs: number, reiniciou: boolean, motivo?: string): string {
  const horas = Math.max(1, Math.round(silencioMs / 3_600_000));
  const acao = reiniciou
    ? "O sistema reiniciou a sessão automaticamente. "
    : motivo === "teto_de_tentativas"
      ? "Os reinícios automáticos não resolveram e foram suspensos. "
      : "";
  return (
    `A conexão aparece como ativa, mas não entra mensagem há cerca de ${horas} h em horário comercial. ` +
    `${acao}Se continuar assim, em Conexões desconecte o aparelho no celular (Aparelhos conectados) e reconecte pelo QR code.`
  );
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const admin = createAdminClient();
  const agora = new Date();

  const { data, error } = await admin
    .from("channel_sessions")
    .select(`id, organization_id, status, metadata, ${CHANNEL_SESSION_REF_COLUMNS}`)
    .is("archived_at", null)
    .eq("provider", PROVIDER_REINICIAVEL)
    .eq("status", "WORKING")
    .limit(LIMITE);
  if (error) {
    logger.error("[session-silencio-watcher] leitura falhou", { detail: error.message, requestId });
    return fail("internal_error", error.message, 500, { requestId });
  }

  let avisados = 0;
  let reiniciados = 0;
  let resolvidos = 0;

  for (const s of (data ?? []) as Array<Record<string, any>>) { // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      const nome = resolveSessionRef(s as Parameters<typeof resolveSessionRef>[0]);
      if (!nome || ehNomeDeSessaoE2E(nome)) continue;

      const { data: conv } = await admin
        .from("conversations")
        .select("last_inbound_at")
        .eq("organization_id", s.organization_id)
        .eq("channel_session_id", s.id)
        .not("last_inbound_at", "is", null)
        .order("last_inbound_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const ultimaEntradaEm = conv?.last_inbound_at ? new Date(conv.last_inbound_at as string) : null;

      const metadata = (s.metadata ?? {}) as Record<string, unknown>;
      const estado = ((metadata.silencio as EstadoDeReinicio | undefined) ?? SEM_REINICIOS) as EstadoDeReinicio;

      const { data: aberto } = await admin
        .from("agent_inbox_items")
        .select("id, created_at")
        .eq("organization_id", s.organization_id)
        .eq("kind", KIND)
        .eq("ref_kind", "channel_session")
        .eq("ref_id", s.id)
        .eq("title", TITULO)
        .eq("status", "open")
        .limit(1)
        .maybeSingle();

      // Voltou a entrar mensagem depois do aviso: fecha e zera as tentativas.
      if (aberto && ultimaEntradaEm && ultimaEntradaEm.getTime() > Date.parse(aberto.created_at as string)) {
        await admin
          .from("agent_inbox_items")
          .update({ status: "resolved" })
          .eq("id", aberto.id)
          .eq("status", "open");
        await admin
          .from("channel_sessions")
          .update({ metadata: { ...metadata, silencio: SEM_REINICIOS } })
          .eq("id", s.id);
        resolvidos++;
        continue;
      }

      // Só consulta `messages` quando já há silêncio a tratar (leitura barata antes).
      const pre = avaliarSilencio({ status: s.status, ultimaEntradaEm, agora, estado, envioEmAndamento: false });
      if (pre.acao !== "avisar_e_reiniciar") {
        if (pre.acao === "so_avisar" && !aberto) await abrirAviso(admin, s, pre.silencioMs, false, pre.motivo);
        if (pre.acao === "so_avisar" && !aberto) avisados++;
        continue;
      }

      const { data: envio } = await admin
        .from("messages")
        .select("id")
        .eq("organization_id", s.organization_id)
        .eq("channel_session_id", s.id)
        .eq("status", "sending")
        .gte("created_at", new Date(agora.getTime() - JANELA_DE_ENVIO_MS).toISOString())
        .limit(1)
        .maybeSingle();
      const desfecho = avaliarSilencio({
        status: s.status,
        ultimaEntradaEm,
        agora,
        estado,
        envioEmAndamento: !!envio,
      });
      if (desfecho.acao === "so_avisar") {
        if (!aberto) {
          await abrirAviso(admin, s, desfecho.silencioMs, false, desfecho.motivo);
          avisados++;
        }
        continue;
      }
      if (desfecho.acao !== "avisar_e_reiniciar") continue;

      // Grava a tentativa ANTES da chamada: se o restart travar, o cooldown já vale.
      await admin
        .from("channel_sessions")
        .update({
          metadata: {
            ...metadata,
            silencio: { tentativas: desfecho.tentativa, ultima_tentativa_em: agora.toISOString() },
          },
        })
        .eq("id", s.id);

      const reiniciou = await reiniciarSessao(nome);
      if (reiniciou) reiniciados++;
      logger.warn("[session-silencio-watcher] sessão muda", {
        sessionId: s.id,
        tentativa: desfecho.tentativa,
        reiniciou,
        requestId,
      });
      if (!aberto) {
        await abrirAviso(admin, s, desfecho.silencioMs, reiniciou);
        avisados++;
      }
    } catch (e) {
      logger.error("[session-silencio-watcher] sessão falhou", {
        sessionId: s.id,
        detail: e instanceof Error ? e.message : String(e),
        requestId,
      });
    }
  }

  if (avisados > 0 || reiniciados > 0 || resolvidos > 0) {
    void audit({
      action: "channel.session_silencio_watcher_run",
      organizationId: null,
      bypassedRls: true,
      metadata: { avisados, reiniciados, resolvidos },
      requestId,
    });
  }

  return ok({ sessoes: (data ?? []).length, avisados, reiniciados, resolvidos }, { requestId });
}

async function abrirAviso(
  admin: ReturnType<typeof createAdminClient>,
  s: Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  silencioMs: number,
  reiniciou: boolean,
  motivo?: string,
): Promise<void> {
  await admin.from("agent_inbox_items").insert({
    organization_id: s.organization_id,
    kind: KIND,
    severity: "warn",
    title: TITULO,
    body: corpo(silencioMs, reiniciou, motivo),
    ref_kind: "channel_session",
    ref_id: s.id,
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
