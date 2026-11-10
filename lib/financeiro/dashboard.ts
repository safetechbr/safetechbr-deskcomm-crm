/**
 * Cálculo puro do Dashboard financeiro: cartões de topo, fluxo de caixa por dia e
 * despesas por categoria. Fora do componente para ser testável sem DOM.
 *
 * ⚠️ "Receitas/Despesas do período" contam só o que está PAGO (caixa realizado);
 * pendente aparece à parte em Previsão de Entrada e Contas Atrasadas.
 */

export type LancamentoDash = {
  id: string;
  account_id: string;
  account_plan_id: string | null;
  card_id: string | null;
  direction: "in" | "out";
  amount_cents: number;
  entry_date: string; // YYYY-MM-DD
  due_date: string | null;
  status: "pending" | "paid";
  paid_at: string | null;
};

export type FiltrosDash = {
  direction: "all" | "in" | "out";
  status: "all" | "pending" | "paid";
  planoId: string;
  contaId: string;
};
export const FILTROS_DASH_VAZIOS: FiltrosDash = { direction: "all", status: "all", planoId: "", contaId: "" };

export function filtrarDash(itens: LancamentoDash[], f: FiltrosDash): LancamentoDash[] {
  return itens.filter(
    (i) =>
      (f.direction === "all" || i.direction === f.direction) &&
      (f.status === "all" || i.status === f.status) &&
      (!f.planoId || i.account_plan_id === f.planoId) &&
      (!f.contaId || i.account_id === f.contaId),
  );
}

/** Data em que o dinheiro deve mexer: o vencimento, se houver; senão a do lançamento. */
export function vencimento(i: LancamentoDash): string {
  return i.due_date ?? i.entry_date;
}

export function somarDias(dia: string, dias: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + dias)).toISOString().slice(0, 10);
}

export type CartoesDeTopo = {
  receitas: number;
  despesas: number;
  saldoPeriodo: number;
  previsaoEntrada: number;
  atrasadas: { total: number; quantidade: number };
};

/**
 * `periodo`: lançamentos do intervalo escolhido. `pendentes`: TODOS os pendentes
 * (qualquer data), pois atraso e previsão não dependem do período do filtro.
 * Compra no cartão (card_id) fica de fora de atrasadas: é fatura, não conta vencida.
 */
export function calcularCartoes(
  periodo: LancamentoDash[],
  pendentes: LancamentoDash[],
  hoje: string,
): CartoesDeTopo {
  let receitas = 0;
  let despesas = 0;
  for (const i of periodo) {
    if (i.status !== "paid") continue;
    if (i.direction === "in") receitas += i.amount_cents;
    else despesas += i.amount_cents;
  }
  const limite = somarDias(hoje, 7);
  let previsaoEntrada = 0;
  const atrasadas = { total: 0, quantidade: 0 };
  for (const i of pendentes) {
    if (i.status !== "pending") continue;
    const v = vencimento(i);
    if (i.direction === "in" && v >= hoje && v <= limite) previsaoEntrada += i.amount_cents;
    if (i.direction === "out" && !i.card_id && v < hoje) {
      atrasadas.total += i.amount_cents;
      atrasadas.quantidade += 1;
    }
  }
  return { receitas, despesas, saldoPeriodo: receitas - despesas, previsaoEntrada, atrasadas };
}

/** Um ponto por dia com movimento (pago), em ordem cronológica. */
export function fluxoDeCaixa(
  periodo: LancamentoDash[],
): { dia: string; receitas: number; despesas: number }[] {
  const mapa = new Map<string, { receitas: number; despesas: number }>();
  for (const i of periodo) {
    if (i.status !== "paid") continue;
    const p = mapa.get(i.entry_date) ?? { receitas: 0, despesas: 0 };
    if (i.direction === "in") p.receitas += i.amount_cents;
    else p.despesas += i.amount_cents;
    mapa.set(i.entry_date, p);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dia, v]) => ({ dia, ...v }));
}

/** Despesas pagas por categoria, maior primeiro. Sem categoria cai em "Sem categoria". */
export function despesasPorCategoria(
  periodo: LancamentoDash[],
  nomeDoPlano: (id: string) => string | undefined,
): { nome: string; total: number; percentual: number }[] {
  const mapa = new Map<string, number>();
  let soma = 0;
  for (const i of periodo) {
    if (i.status !== "paid" || i.direction !== "out") continue;
    const nome = (i.account_plan_id && nomeDoPlano(i.account_plan_id)) || "Sem categoria";
    mapa.set(nome, (mapa.get(nome) ?? 0) + i.amount_cents);
    soma += i.amount_cents;
  }
  return [...mapa.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([nome, total]) => ({ nome, total, percentual: soma ? (total / soma) * 100 : 0 }));
}
