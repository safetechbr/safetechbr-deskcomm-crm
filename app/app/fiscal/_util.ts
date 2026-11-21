export const OPERACOES: Record<string, string> = {
  ENT_COMPRA_PF: "Entrada · compra de pessoa física",
  ENT_COMPRA_PJ: "Entrada · compra de empresa",
  ENT_TROCA: "Entrada · veículo de troca",
  SAI_VENDA: "Saída · venda",
};

export const STATUS: Record<string, { rotulo: string; cor: string }> = {
  rascunho: { rotulo: "Rascunho", cor: "bg-muted text-muted-foreground" },
  processando: { rotulo: "Processando", cor: "bg-amber-500/15 text-amber-700" },
  autorizada: { rotulo: "Autorizada", cor: "bg-emerald-500/15 text-emerald-700" },
  rejeitada: { rotulo: "Rejeitada", cor: "bg-red-500/15 text-red-700" },
  denegada: { rotulo: "Denegada", cor: "bg-red-500/15 text-red-700" },
  cancelada: { rotulo: "Cancelada", cor: "bg-muted text-muted-foreground" },
  inutilizada: { rotulo: "Inutilizada", cor: "bg-muted text-muted-foreground" },
};

export const reais = (c: number | null) => (c == null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

export async function chamar(url: string, metodo: string, corpo?: unknown): Promise<{ ok: boolean; data?: unknown; msg?: string }> {
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const json = (await res.json().catch(() => null)) as { data?: unknown; error?: { message?: string; details?: { pendencias?: string[] } } } | null;
    if (!res.ok) {
      const pend = json?.error?.details?.pendencias;
      return { ok: false, msg: pend?.length ? `${json?.error?.message ?? ""} ${pend.join(" ")}`.trim() : json?.error?.message ?? "Não foi possível concluir." };
    }
    return { ok: true, data: json?.data };
  } catch {
    return { ok: false, msg: "Sem conexão com o servidor." };
  }
}
