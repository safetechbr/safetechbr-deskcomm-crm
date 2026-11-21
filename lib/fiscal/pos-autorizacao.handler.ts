/**
 * Consumidor de `nfe.autorizada`: arquiva XML/DANFE (retenção), enfileira o RENAVE
 * (se a loja ligou) e entrega ao comprador (se a loja ligou a entrega automática).
 * Tudo idempotente; rede de terceiro, por isso registrado perto do fim.
 */
import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";

const KEY = "fiscal.pos-autorizacao";
const res = (status: HandlerResult["status"], detail?: string): HandlerResult => ({ consumer_key: KEY, status, detail });

async function handle(row: EventRow): Promise<HandlerResult> {
  const orgId = row.organization_id;
  const docId = row.entity_id;
  const operacao = String((row.payload as { operacao?: string } | null)?.operacao ?? "");
  if (!docId) return res("skipped", "sem_documento");

  // Imports tardios: o topo do handler precisa ficar leve (o dreno roda sob tsx).
  const [{ arquivarDocumento }, { enfileirarRenave }, { entregarAoComprador }] = await Promise.all([
    import("@/lib/fiscal/arquivar"),
    import("@/lib/renave/fila"),
    import("@/lib/fiscal/entrega"),
  ]);
  const admin = createAdminClient();

  const arq = await arquivarDocumento(admin, orgId, docId);
  const { data: cfg } = await admin.from("config_fiscal_loja").select("renave_ativo, entrega_automatica").eq("organization_id", orgId).limit(1).maybeSingle();

  if (cfg?.renave_ativo) await enfileirarRenave(admin, orgId, docId, operacao);
  if (operacao === "SAI_VENDA" && cfg?.entrega_automatica) {
    const e = await entregarAoComprador(admin, orgId, docId, { forcar: false });
    if (!e.ok && e.erro === "falha_envio") return { consumer_key: KEY, status: "retry", retry_at: new Date(Date.now() + 10 * 60_000).toISOString(), detail: "entrega_falhou" };
  }
  // Falha ao arquivar não é defeito de programa: o cron varre e o envio faz arquivo sob demanda.
  return arq.ok ? res("ok") : res("skipped", `arquivo_pendente:${arq.erro}`);
}

export const posAutorizacaoFiscalHandler: EventHandler = {
  key: KEY,
  naOrgParada: "pula",
  events: ["nfe.autorizada"],
  handle,
};
