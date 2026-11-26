import { ROTULO_DA_FORMA, resumoDaNegociacao, type Negociacao } from "./regras";

/**
 * Recibo de pagamento e termo de quitação do PDV.
 * O recibo nasce no banco (gatilho da migration 9060), um por lançamento de
 * entrada pago. O saldo não é gravado: é calculado aqui, na hora de imprimir.
 */

/** Lançamento de entrada da venda (financial_entries, direction 'in', sem estornos). */
export interface LancamentoDaVenda {
  id: string;
  forma_pagamento: string | null;
  amount_cents: number;
  status: "pending" | "paid";
  paid_at: string | null;
  parcela_numero: number | null;
  parcela_total: number | null;
  /** AAAA-MM-DD; usado pela nota promissória. */
  due_date?: string | null;
}

/** Linha de recibos_de_pagamento. */
export interface ReciboDePagamento {
  numero: number;
  lancamento_id: string;
  valor_cents: number;
  forma_pagamento: string | null;
  parcela_numero: number | null;
  parcela_total: number | null;
  recebido_em: string;
}

const instante = (iso: string) => new Date(iso).getTime();

/**
 * O que ainda falta receber logo depois do recibo. Conta como já pago o
 * lançamento pago antes do recibo, ou no mesmo instante com recibo de número
 * menor ou igual (ou sem recibo, como o financiamento). Na conclusão da venda
 * vários lançamentos entram no mesmo instante; o número desempata.
 */
export function saldoAposRecibo(
  recibo: ReciboDePagamento,
  lancamentos: LancamentoDaVenda[],
  recibos: ReciboDePagamento[],
): number {
  const numeroDo = new Map(recibos.map((r) => [r.lancamento_id, r.numero]));
  const t = instante(recibo.recebido_em);
  return lancamentos.reduce((falta, l) => {
    if (l.status === "paid" && l.paid_at) {
      const p = instante(l.paid_at);
      const n = numeroDo.get(l.id);
      if (p < t || (p === t && (n === undefined || n <= recibo.numero))) return falta;
    }
    return falta + l.amount_cents;
  }, 0);
}

export interface SituacaoDaQuitacao {
  quitada: boolean;
  pendente_cents: number;
}

/** Quitada = venda concluída e nenhum lançamento de entrada pendente (o do banco incluso). */
export function situacaoDaQuitacao(
  n: Pick<Negociacao, "status" | "tipo">,
  lancamentos: LancamentoDaVenda[],
): SituacaoDaQuitacao {
  const pendente_cents = lancamentos
    .filter((l) => l.status === "pending")
    .reduce((s, l) => s + l.amount_cents, 0);
  return {
    quitada:
      n.tipo === "venda" && n.status === "concluida" && lancamentos.length > 0 && pendente_cents === 0,
    pendente_cents,
  };
}

export const rotuloDaForma = (forma: string | null) =>
  (forma && ROTULO_DA_FORMA[forma as keyof typeof ROTULO_DA_FORMA]) || forma || "—";

export const rotuloDaParcela = (numero: number | null, total: number | null) =>
  numero && total && total > 1 ? `parcela ${numero}/${total}` : null;

export interface LinhaDaQuitacao {
  descricao: string;
  /** Nº do recibo, banco ou "—". */
  referencia: string;
  /** ISO ou null. */
  data: string | null;
  valor_cents: number;
}

/**
 * Tabela do termo de quitação: a troca como compensação no preço, o que o banco
 * pagou e cada recibo pelo número, em ordem.
 */
export function linhasDaQuitacao(
  n: Negociacao,
  lancamentos: LancamentoDaVenda[],
  recibos: ReciboDePagamento[],
): LinhaDaQuitacao[] {
  const linhas: LinhaDaQuitacao[] = [];
  const troca = resumoDaNegociacao(n).troca_liquida_cents;
  // shortcut: troca com quitação maior que a avaliação (líquido ≤ 0) não vira linha; o excesso já está nos pagamentos.
  if (troca > 0)
    linhas.push({
      descricao: "Veículo recebido na troca (compensação no preço)",
      referencia: "—",
      data: n.contrato?.recebimento_troca_em ?? null,
      valor_cents: troca,
    });
  const comRecibo = new Set(recibos.map((r) => r.lancamento_id));
  const bancos = n.pagamentos.filter((p) => p.forma === "financiamento" || p.forma === "consorcio");
  for (const l of lancamentos) {
    if (comRecibo.has(l.id) || l.status !== "paid") continue;
    const banco = bancos.find((p) => p.forma === l.forma_pagamento)?.banco?.trim();
    linhas.push({
      descricao: rotuloDaForma(l.forma_pagamento),
      referencia: banco || "—",
      data: l.paid_at,
      valor_cents: l.amount_cents,
    });
  }
  for (const r of [...recibos].sort((a, b) => a.numero - b.numero)) {
    const parcela = rotuloDaParcela(r.parcela_numero, r.parcela_total);
    linhas.push({
      descricao: [rotuloDaForma(r.forma_pagamento), parcela].filter(Boolean).join(", "),
      referencia: `Recibo nº ${r.numero}`,
      data: r.recebido_em,
      valor_cents: r.valor_cents,
    });
  }
  return linhas;
}
