/**
 * GET|POST /api/v1/cron/fiscal-consulta — rede de segurança do webhook da Focus.
 *
 * Lê no provedor as notas que ficaram `processando` há mais de 1 minuto e grava
 * o desfecho. Só audita quando algum status mudou (rodada vazia não é mutação).
 * Auth: `Authorization: Bearer <INTERNAL_CRON_SECRET>` (fail-closed).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { aplicarResultado } from "@/lib/fiscal/aplicar-resultado";
import { carregarConfigComContexto } from "@/lib/fiscal/config-servidor";
import { FocusNfeProvider, NotaNaoEncontradaNoProvedor } from "@/lib/fiscal/focus/provider";
import { idsDeOrgsParadas } from "@/lib/organizacao/operante";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TANDA = 50;
const ESQUECIDA_MS = 10 * 60_000;
const NAO_CHEGOU = "A nota não chegou ao provedor fiscal. Emita de novo.";

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }
  const admin = createAdminClient();
  const paradas = new Set(await idsDeOrgsParadas(admin));
  const corte = new Date(Date.now() - 60_000).toISOString();
  const { data: pendentes, error } = await admin.from("documentos_fiscais")
    .select("id, organization_id, status, rascunho, ref_provider, updated_at")
    .eq("status", "processando").lt("updated_at", corte).order("updated_at").limit(TANDA);
  if (error) {
    logger.error("[fiscal-consulta] leitura falhou", { error: error.message, requestId });
    return fail("internal_error", "fiscal_consulta_failed", 500, { requestId });
  }

  const provider = new FocusNfeProvider();
  const ctxPorOrg = new Map<string, Awaited<ReturnType<typeof carregarConfigComContexto>>>();
  let consultadas = 0;
  let atualizadas = 0;
  let falhas = 0;
  const daNota = (doc: { id: unknown; organization_id: unknown }, patch: Record<string, unknown>) =>
    admin.from("documentos_fiscais").update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", doc.id as string).eq("organization_id", doc.organization_id as string).eq("status", "processando");
  // Nota pulada ou com falha vai para o fim da fila: sem isto, 50 presas ocupam toda rodada.
  const adiar = (doc: { id: unknown; organization_id: unknown }) => daNota(doc, {});
  const devolver = async (doc: { id: unknown; organization_id: unknown; status: unknown }) => {
    const { error: eDev } = await daNota(doc, { status: "rejeitada", motivo_rejeicao: NAO_CHEGOU });
    if (!eDev) {
      atualizadas++;
      await audit({ organizationId: doc.organization_id as string, bypassedRls: true, action: "fiscal.documento_atualizado",
        resourceType: "documentos_fiscais", resourceId: doc.id as string, requestId,
        metadata: { origem: "cron_fiscal_consulta", de: doc.status, para: "rejeitada", motivo: "nao_chegou_ao_provedor" } });
    }
  };
  for (const doc of pendentes ?? []) {
    const org = doc.organization_id as string;
    if (paradas.has(org)) { await adiar(doc); continue; }
    if (!ctxPorOrg.has(org)) ctxPorOrg.set(org, await carregarConfigComContexto(admin, org));
    const ctx = ctxPorOrg.get(org)?.ctx;
    if (!ctx) { await adiar(doc); continue; }
    // Sem ref, a emissão parou antes de chamar o provedor: o número continua dela, reemitir é seguro.
    if (!doc.ref_provider) { await devolver(doc); continue; }
    consultadas++;
    try {
      const r = await provider.consultarNfe(ctx, doc.ref_provider as string);
      if (await aplicarResultado(admin, doc, r)) {
        atualizadas++;
        await audit({ organizationId: org, bypassedRls: true, action: "fiscal.documento_atualizado",
          resourceType: "documentos_fiscais", resourceId: doc.id as string, requestId,
          metadata: { origem: "cron_fiscal_consulta", de: doc.status, para: r.status } });
      }
    } catch (e) {
      // 404 por 10 min: o envio não chegou à Focus (timeout antes do aceite). Reemitir com a mesma ref é seguro.
      const esquecida = Date.now() - new Date(doc.updated_at as string).getTime() > ESQUECIDA_MS;
      if (e instanceof NotaNaoEncontradaNoProvedor && esquecida) { await devolver(doc); continue; }
      falhas++;
      logger.error("[fiscal-consulta] consulta falhou", { error: e instanceof Error ? e.message : "erro", requestId });
      // 404 recente não adia: precisa envelhecer para virar `rejeitada`.
      if (!(e instanceof NotaNaoEncontradaNoProvedor)) await adiar(doc);
    }
  }
  return ok({ consultadas, atualizadas, falhas }, { requestId });
}

export const GET = handle;
export const POST = handle;
