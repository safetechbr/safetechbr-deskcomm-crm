/** Fila de envio ao RENAVE: enfileira na autorização, o cron envia com retentativa. */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import type { RascunhoFiscal } from "@/lib/fiscal/rascunho";

import { enviarAoRenave, operacaoRenave, type RegistroRenave } from "./client";

export const MAX_TENTATIVAS = 8;
const BACKOFF_MAX_MS = 6 * 3_600_000;

/** 1 min, 2, 4, … teto de 6 h. */
export function backoffMs(tentativas: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, tentativas - 1), BACKOFF_MAX_MS);
}

/** O Renave só conhece produção: nota de homologação nunca vai para lá. */
export const renavePermitido = (ambiente: unknown): boolean => ambiente === "producao";

export async function enfileirarRenave(admin: SupabaseClient, orgId: string, docId: string, operacaoFiscal: string): Promise<boolean> {
  const op = operacaoRenave(operacaoFiscal);
  if (!op) return false;
  const { data: doc } = await admin.from("documentos_fiscais").select("ambiente").eq("id", docId).eq("organization_id", orgId).maybeSingle();
  if (!renavePermitido(doc?.ambiente)) {
    await admin.from("documentos_fiscais").update({ renave_status: "homologacao" }).eq("id", docId).eq("organization_id", orgId);
    return false;
  }
  const { error } = await admin
    .from("renave_fila")
    .upsert({ organization_id: orgId, documento_id: docId, operacao: op }, { onConflict: "documento_id", ignoreDuplicates: true });
  if (error) {
    logger.error("[renave] enfileirar falhou", { orgId, docId, erro: error.message });
    return false;
  }
  await admin.from("documentos_fiscais").update({ renave_status: "pendente" }).eq("id", docId).eq("organization_id", orgId);
  return true;
}

export interface ResumoFila { enviados: number; reenfileirados: number; erros: number }

export async function processarFilaRenave(admin: SupabaseClient, limite: number): Promise<ResumoFila> {
  const resumo: ResumoFila = { enviados: 0, reenfileirados: 0, erros: 0 };
  const agora = new Date();
  const { data: itens } = await admin
    .from("renave_fila")
    .select("id, organization_id, documento_id, operacao, attempts")
    .eq("status", "pendente")
    .lte("next_attempt_at", agora.toISOString())
    .order("next_attempt_at")
    .limit(limite);

  for (const item of itens ?? []) {
    const orgId = item.organization_id as string;
    // Reserva o item (outro tick não pega): adia 5 min antes de chamar a rede.
    const reserva = await admin
      .from("renave_fila")
      .update({ next_attempt_at: new Date(agora.getTime() + 300_000).toISOString() })
      .eq("id", item.id)
      .eq("status", "pendente")
      .lte("next_attempt_at", agora.toISOString())
      .select("id");
    if (!reserva.data?.length) continue;

    const [{ data: doc }, { data: cfg }] = await Promise.all([
      admin.from("documentos_fiscais").select("chave, valor_total_cents, ambiente, rascunho").eq("id", item.documento_id).eq("organization_id", orgId).maybeSingle(),
      admin.from("config_fiscal_loja").select("cnpj, renave_ativo").eq("organization_id", orgId).limit(1).maybeSingle(),
    ]);
    const finalizar = async (status: string, extra: Record<string, unknown>) => {
      await admin.from("renave_fila").update({ status, ...extra }).eq("id", item.id).eq("organization_id", orgId);
      await admin.from("documentos_fiscais").update({ renave_status: status, ...(status === "enviado" ? { renave_enviado_em: new Date().toISOString() } : {}) }).eq("id", item.documento_id).eq("organization_id", orgId);
    };

    if (!renavePermitido(doc?.ambiente)) { await finalizar("homologacao", { last_error: null }); continue; }
    if (!cfg?.renave_ativo) { await finalizar("desligado", { last_error: null }); continue; }
    if (!doc?.chave || !cfg.cnpj) { await finalizar("erro", { last_error: "dados_incompletos" }); resumo.erros++; continue; }

    const rasc = doc.rascunho as Partial<RascunhoFiscal> | null;
    const registrar = async (e: RegistroRenave) => {
      await admin.from("renave_log").insert({
        organization_id: orgId, documento_id: item.documento_id, endpoint: e.endpoint, metodo: e.metodo,
        status_http: e.status, duracao_ms: e.ms, erro: e.erro ?? null,
      });
    };
    const r = await enviarAoRenave({
      cnpj: String(cfg.cnpj), op: item.operacao as "purchase" | "sales", chave: String(doc.chave), valorCents: Number(doc.valor_total_cents ?? 0),
      pessoa: rasc?.pessoa, veiculo: rasc?.veiculo,
    }, registrar);
    const tentativas = (item.attempts as number) + 1;
    if (r.tipo === "ok") { await finalizar("enviado", { attempts: tentativas, enviado_em: new Date().toISOString(), last_error: null }); resumo.enviados++; continue; }
    if (r.tipo === "rejeitado" || tentativas >= MAX_TENTATIVAS) {
      await finalizar("erro", { attempts: tentativas, last_error: r.tipo === "nao_encontrado" ? "nao_encontrado" : r.erro });
      resumo.erros++;
      continue;
    }
    await admin.from("renave_fila").update({
      attempts: tentativas,
      next_attempt_at: new Date(Date.now() + backoffMs(tentativas)).toISOString(),
      last_error: r.tipo === "nao_encontrado" ? "nao_encontrado" : r.erro,
    }).eq("id", item.id).eq("organization_id", orgId);
    resumo.reenfileirados++;
  }
  return resumo;
}
