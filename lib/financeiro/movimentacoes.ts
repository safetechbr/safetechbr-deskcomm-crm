/**
 * Cálculo puro da tela de Movimentações: o intervalo do mês, os quatro totais do
 * topo e o agrupamento por dia. Fica fora do componente para ser testável sem DOM.
 *
 * ⚠️ O TOTAL "RECEITAS/DESPESAS" É SÓ O QUE ESTÁ PAGO e os "PENDENTES" são o que
 * ainda não foi. Misturar os dois faria o caixa do mês parecer maior do que é.
 */

export type Movimentacao = {
  id: string;
  account_id: string;
  account_plan_id: string | null;
  direction: "in" | "out";
  amount_cents: number;
  description: string | null;
  entry_date: string; // YYYY-MM-DD
  status: "pending" | "paid";
  origin: "manual" | "sale" | "reversal" | "recurring";
};

export type Totais = {
  receitas: number;
  despesas: number;
  receitasPendentes: number;
  despesasPendentes: number;
};

export type Filtros = {
  direction: "all" | "in" | "out";
  status: "all" | "pending" | "paid";
  planoId: string;
  contaId: string;
};

export const FILTROS_VAZIOS: Filtros = { direction: "all", status: "all", planoId: "", contaId: "" };

/** `mes` é 1–12. Devolve o primeiro e o último dia, no formato do `<input type=date>`. */
export function intervaloDoMes(ano: number, mes: number): { de: string; ate: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { de: `${ano}-${pad(mes)}-01`, ate: `${ano}-${pad(mes)}-${pad(ultimo)}` };
}

export function mesAnterior(ano: number, mes: number) {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

export function mesSeguinte(ano: number, mes: number) {
  return mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
}

export function calcularTotais(itens: Movimentacao[]): Totais {
  const t: Totais = { receitas: 0, despesas: 0, receitasPendentes: 0, despesasPendentes: 0 };
  for (const i of itens) {
    if (i.direction === "in") {
      if (i.status === "paid") t.receitas += i.amount_cents;
      else t.receitasPendentes += i.amount_cents;
    } else if (i.status === "paid") t.despesas += i.amount_cents;
    else t.despesasPendentes += i.amount_cents;
  }
  return t;
}

export function filtrar(itens: Movimentacao[], f: Filtros): Movimentacao[] {
  return itens.filter(
    (i) =>
      (f.direction === "all" || i.direction === f.direction) &&
      (f.status === "all" || i.status === f.status) &&
      (!f.planoId || i.account_plan_id === f.planoId) &&
      (!f.contaId || i.account_id === f.contaId),
  );
}

/** Dias do mais recente ao mais antigo; dentro do dia a ordem de entrada é mantida. */
export function agruparPorDia(itens: Movimentacao[]): { dia: string; itens: Movimentacao[] }[] {
  const mapa = new Map<string, Movimentacao[]>();
  for (const i of itens) {
    const lista = mapa.get(i.entry_date);
    if (lista) lista.push(i);
    else mapa.set(i.entry_date, [i]);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([dia, lista]) => ({ dia, itens: lista }));
}

/** "2026-11-09" → "segunda-feira, 9 de novembro" sem passar por fuso (meio-dia UTC). */
export function rotuloDoDia(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d!, 12)).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function rotuloDoMes(ano: number, mes: number): string {
  const s = new Date(Date.UTC(ano, mes - 1, 1, 12)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
