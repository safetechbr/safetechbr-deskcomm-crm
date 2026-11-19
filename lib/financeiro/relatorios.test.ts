import { describe, expect, it } from "vitest";
import type { LancamentoDash } from "./dashboard";
import { csvDaDre, dreDoPeriodo } from "./relatorios";

let n = 0;
function l(p: Partial<LancamentoDash>): LancamentoDash {
  return {
    id: `l${++n}`,
    account_id: "c1",
    account_plan_id: null,
    card_id: null,
    direction: "in",
    amount_cents: 100,
    entry_date: "2026-11-10",
    due_date: null,
    status: "paid",
    paid_at: null,
    ...p,
  };
}
const nomes: Record<string, string> = { vendas: "Vendas", aluguel: "Aluguel" };
const nome = (id: string) => nomes[id];

describe("dreDoPeriodo", () => {
  const dre = dreDoPeriodo(
    [
      l({ account_plan_id: "vendas", amount_cents: 10000 }),
      l({ account_plan_id: "vendas", amount_cents: 5000, status: "pending" }),
      l({ amount_cents: 300 }),
      l({ direction: "out", account_plan_id: "aluguel", amount_cents: 4000 }),
      l({ direction: "out", account_plan_id: "sumiu", amount_cents: 700, status: "pending" }),
    ],
    nome,
  );

  it("agrupa por plano, separa pago de pendente e cai em 'Sem categoria'", () => {
    expect(dre.receitas.linhas).toEqual([
      { categoria: "Vendas", realizado: 10000, previsto: 5000 },
      { categoria: "Sem categoria", realizado: 300, previsto: 0 },
    ]);
    expect(dre.despesas.linhas).toEqual([
      { categoria: "Aluguel", realizado: 4000, previsto: 0 },
      { categoria: "Sem categoria", realizado: 0, previsto: 700 },
    ]);
  });

  it("totaliza e calcula o resultado realizado e previsto", () => {
    expect(dre.receitas).toMatchObject({ realizado: 10300, previsto: 5000 });
    expect(dre.despesas).toMatchObject({ realizado: 4000, previsto: 700 });
    expect(dre.resultado).toEqual({ realizado: 6300, previsto: 4300 });
  });

  it("período vazio dá tudo zero", () => {
    expect(dreDoPeriodo([], nome).resultado).toEqual({ realizado: 0, previsto: 0 });
  });

  it("gera CSV com ; e vírgula decimal", () => {
    const linhas = csvDaDre(dre).split("\n");
    expect(linhas[0]).toBe('"Tipo";"Categoria";"Realizado";"Previsto";"Total"');
    expect(linhas[1]).toBe('"Receitas";"Vendas";"100,00";"50,00";"150,00"');
    expect(linhas.at(-1)).toBe('"Resultado";"Receitas - despesas";"63,00";"43,00";"106,00"');
  });
});
