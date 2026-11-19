/**
 * Relatório financeiro do período (DRE simples): receitas e despesas agrupadas
 * por plano de contas, separando o realizado (pago) do previsto (pendente).
 * Puro, para ser testável sem DOM. Usa as mesmas linhas do Dashboard
 * (`periodo`, filtrado por `entry_date`).
 */
import type { LancamentoDash } from "./dashboard";

export type LinhaDre = { categoria: string; realizado: number; previsto: number };
export type GrupoDre = { linhas: LinhaDre[]; realizado: number; previsto: number };
export type Dre = {
  receitas: GrupoDre;
  despesas: GrupoDre;
  resultado: { realizado: number; previsto: number };
};

const SEM_CATEGORIA = "Sem categoria";

function agrupar(itens: LancamentoDash[], nomeDoPlano: (id: string) => string | undefined): GrupoDre {
  const mapa = new Map<string, LinhaDre>();
  for (const i of itens) {
    const categoria = (i.account_plan_id && nomeDoPlano(i.account_plan_id)) || SEM_CATEGORIA;
    const linha = mapa.get(categoria) ?? { categoria, realizado: 0, previsto: 0 };
    if (i.status === "paid") linha.realizado += i.amount_cents;
    else linha.previsto += i.amount_cents;
    mapa.set(categoria, linha);
  }
  const linhas = [...mapa.values()].sort(
    (a, b) => b.realizado + b.previsto - (a.realizado + a.previsto) || a.categoria.localeCompare(b.categoria),
  );
  return {
    linhas,
    realizado: linhas.reduce((s, l) => s + l.realizado, 0),
    previsto: linhas.reduce((s, l) => s + l.previsto, 0),
  };
}

export function dreDoPeriodo(periodo: LancamentoDash[], nomeDoPlano: (id: string) => string | undefined): Dre {
  const receitas = agrupar(
    periodo.filter((i) => i.direction === "in"),
    nomeDoPlano,
  );
  const despesas = agrupar(
    periodo.filter((i) => i.direction === "out"),
    nomeDoPlano,
  );
  return {
    receitas,
    despesas,
    resultado: {
      realizado: receitas.realizado - despesas.realizado,
      previsto: receitas.previsto - despesas.previsto,
    },
  };
}

/** Centavos no formato do Excel pt-BR: "1234,56" (sem separador de milhar). */
function valor(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function celula(c: string): string {
  return `"${c.replace(/"/g, '""')}"`;
}

/** CSV com `;` (Excel pt-BR). Colunas: Tipo; Categoria; Realizado; Previsto; Total. */
export function csvDaDre(dre: Dre): string {
  const linhas: string[][] = [["Tipo", "Categoria", "Realizado", "Previsto", "Total"]];
  const grupo = (tipo: string, g: GrupoDre) => {
    for (const l of g.linhas)
      linhas.push([tipo, l.categoria, valor(l.realizado), valor(l.previsto), valor(l.realizado + l.previsto)]);
    linhas.push([tipo, `Total de ${tipo.toLowerCase()}`, valor(g.realizado), valor(g.previsto), valor(g.realizado + g.previsto)]);
  };
  grupo("Receitas", dre.receitas);
  grupo("Despesas", dre.despesas);
  const r = dre.resultado;
  linhas.push(["Resultado", "Receitas - despesas", valor(r.realizado), valor(r.previsto), valor(r.realizado + r.previsto)]);
  return linhas.map((l) => l.map(celula).join(";")).join("\n");
}
