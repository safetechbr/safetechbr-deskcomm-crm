/**
 * GET|POST /api/v1/cron/renave-status — a cada 15 min, consulta na integradora
 * só os carros que ainda estão andando no RENAVE (proximo_polling_em vencido):
 * solicitados/no Detran, recém-enviados ou com saída recente sem ATPV-e de
 * saída. Grava a situação, baixa os documentos que ficaram prontos e avisa na
 * Central quando a situação muda. Nada de varredura em massa (regra LGPD).
 * Auth: `Authorization: Bearer <INTERNAL_CRON_SECRET>` (fail-closed).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { logger } from "@/lib/logger";
import { idsDeOrgsParadas } from "@/lib/organizacao/operante";
import { atualizarStatus, baixarDocumento, carregarConfig, TIPOS_DOC, type ConfigRenave } from "@/lib/renave/servico";
import type { SituacaoRenave } from "@/lib/renave/tipos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const LOTE = 40;
const POR_ORG = 10;
const INTERVALO_MS = 15 * 60_000;
const INTERVALO_ERRO_MS = 60 * 60_000;
const SAIDA_RECENTE_MS = 7 * 24 * 60 * 60_000;

const AVISO: Partial<Record<SituacaoRenave, { titulo: string; severidade: "info" | "warn" }>> = {
  T: { titulo: "RENAVE: entrada em andamento no Detran", severidade: "info" },
  C: { titulo: "RENAVE: entrada confirmada, carro em estoque", severidade: "info" },
  V: { titulo: "RENAVE: saída (venda) registrada", severidade: "info" },
  X: { titulo: "RENAVE: processo cancelado", severidade: "warn" },
  E: { titulo: "RENAVE: carro transferido para outro estabelecimento", severidade: "warn" },
  I: { titulo: "RENAVE: carro transferido entre filiais", severidade: "info" },
};

/** Continua consultando? Sim enquanto o processo anda ou há documento pronto sem baixar. */
export function precisaNovaConsulta(
  situacao: string | null,
  documentos: Record<string, { disponivel?: boolean; arquivos?: unknown[] }>,
  saidaEm: string | null,
  agora = Date.now(),
): boolean {
  if (!situacao || situacao === "S" || situacao === "T") return true;
  if (TIPOS_DOC.some((t) => documentos[t]?.disponivel && !(documentos[t]?.arquivos?.length))) return true;
  const saidaRecente = saidaEm !== null && agora - Date.parse(saidaEm) < SAIDA_RECENTE_MS;
  return saidaRecente && !(documentos.atpve_saida?.arquivos?.length);
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  const admin = createAdminClient();
  const agora = new Date();

  const paradas = new Set(await idsDeOrgsParadas(admin));
  const { data: fila, error } = await admin.from("renave_veiculos")
    .select("organization_id, veiculo_id, situacao").eq("integradora", "renave_facil")
    .lte("proximo_polling_em", agora.toISOString()).order("proximo_polling_em").limit(LOTE * 3);
  if (error) {
    logger.error("[renave-status] leitura falhou", { error: error.message, requestId });
    return fail("internal_error", "Leitura da fila falhou.", 500, { requestId });
  }

  const configs = new Map<string, ConfigRenave | null>();
  const porOrg = new Map<string, number>();
  let consultados = 0, mudaram = 0, baixados = 0, erros = 0;

  for (const item of fila ?? []) {
    if (consultados >= LOTE) break;
    const org = item.organization_id as string;
    const veiculoId = item.veiculo_id as string;
    if (paradas.has(org) || (porOrg.get(org) ?? 0) >= POR_ORG) continue;
    if (!configs.has(org)) configs.set(org, await carregarConfig(admin, org).catch(() => null));
    const cfg = configs.get(org);
    if (!cfg?.ativo) {
      // Integração desligada: para de consultar até um novo envio religar.
      await admin.from("renave_veiculos").update({ proximo_polling_em: null }).eq("organization_id", org)
        .eq("veiculo_id", veiculoId).eq("integradora", "renave_facil");
      continue;
    }
    porOrg.set(org, (porOrg.get(org) ?? 0) + 1);
    consultados++;

    const st = await atualizarStatus(admin, org, veiculoId, cfg);
    if ("erro" in st) {
      erros++;
      await admin.from("renave_veiculos").update({ proximo_polling_em: new Date(agora.getTime() + INTERVALO_ERRO_MS).toISOString() })
        .eq("organization_id", org).eq("veiculo_id", veiculoId).eq("integradora", "renave_facil");
      continue;
    }

    if (st.mudou) {
      mudaram++;
      await audit({ organizationId: org, bypassedRls: true, action: "renave.situacao_mudou",
        resourceType: "veiculos", resourceId: veiculoId, requestId,
        metadata: { de: item.situacao ?? null, para: st.situacao || null, origem: "cron" } });
      const aviso = AVISO[st.situacao];
      if (aviso) {
        const { data: v } = await admin.from("veiculos").select("placa, marca, modelo")
          .eq("organization_id", org).eq("id", veiculoId).maybeSingle();
        const nome = [v?.marca, v?.modelo].filter(Boolean).join(" ");
        await admin.from("agent_inbox_items").insert({
          organization_id: org, kind: "other", severity: aviso.severidade, title: aviso.titulo,
          body: `${nome || "Veículo"}${v?.placa ? ` (${v.placa})` : ""}. Veja os detalhes no estoque.`,
          ref_kind: "veiculo", ref_id: veiculoId,
        });
      }
    }

    // Baixa uma vez cada documento que ficou pronto (o serviço ignora os já baixados).
    const { data: rv } = await admin.from("renave_veiculos").select("documentos, saida_em")
      .eq("organization_id", org).eq("veiculo_id", veiculoId).eq("integradora", "renave_facil").maybeSingle();
    const docs = (rv?.documentos ?? {}) as Record<string, { disponivel?: boolean; arquivos?: unknown[] }>;
    for (const tipo of TIPOS_DOC) {
      if (!docs[tipo]?.disponivel || docs[tipo]?.arquivos?.length) continue;
      const r = await baixarDocumento(admin, org, veiculoId, tipo, cfg);
      if ("baixou" in r && r.baixou) {
        baixados++;
        docs[tipo] = { ...docs[tipo], arquivos: [1] };
      }
    }

    const seguir = precisaNovaConsulta(st.situacao || null, docs, (rv?.saida_em as string | null) ?? null, agora.getTime());
    await admin.from("renave_veiculos")
      .update({ proximo_polling_em: seguir ? new Date(agora.getTime() + INTERVALO_MS).toISOString() : null })
      .eq("organization_id", org).eq("veiculo_id", veiculoId).eq("integradora", "renave_facil");
  }

  return ok({ consultados, mudaram, baixados, erros }, { requestId });
}

export const GET = handle;
export const POST = handle;
