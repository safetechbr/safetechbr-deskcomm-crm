import { describe, expect, it } from "vitest";

import {
  calcularCartoes,
  despesasPorCategoria,
  filtrarDash,
  FILTROS_DASH_VAZIOS,
  fluxoDeCaixa,
  somarDias,
  type LancamentoDash,
} from "./dashboard";

const l = (p: Partial<LancamentoDash>): LancamentoDash => ({
  id: "x",
  account_id: "c1",
  account_plan_id: null,
  card_id: null,
  direction: "in",
  amount_cents: 100,
  entry_date: "2026-11-09",
  due_date: null,
  status: "paid",
  paid_at: null,
  ...p,
});

describe("dashboard financeiro", () => {
  it("receitas e despesas do período contam só o pago", () => {
    const c = calcularCartoes(
      [l({ amount_cents: 1000 }), l({ amount_cents: 500, status: "pending" }), l({ direction: "out", amount_cents: 300 })],
      [],
      "2026-11-09",
    );
    expect([c.receitas, c.despesas, c.saldoPeriodo]).toEqual([1000, 300, 700]);
  });

  it("previsão de 7 dias e atrasadas usam o vencimento; cartão não é atraso", () => {
    const pend = [
      l({ status: "pending", amount_cents: 400, due_date: "2026-11-12" }),
      l({ status: "pending", amount_cents: 999, due_date: "2026-11-20" }),
      l({ status: "pending", direction: "out", amount_cents: 200, due_date: "2026-11-01" }),
      l({ status: "pending", direction: "out", amount_cents: 50, entry_date: "2026-10-01", card_id: "k" }),
    ];
    const c = calcularCartoes([], pend, "2026-11-09");
    expect(c.previsaoEntrada).toBe(400);
    expect(c.atrasadas).toEqual({ total: 200, quantidade: 1 });
  });

  it("soma dias virando o mês", () => expect(somarDias("2026-11-28", 7)).toBe("2026-12-05"));

  it("fluxo de caixa agrupa por dia em ordem", () => {
    const f = fluxoDeCaixa([
      l({ entry_date: "2026-11-05", amount_cents: 10 }),
      l({ entry_date: "2026-11-03", direction: "out", amount_cents: 4 }),
      l({ entry_date: "2026-11-05", amount_cents: 5 }),
    ]);
    expect(f).toEqual([
      { dia: "2026-11-03", receitas: 0, despesas: 4 },
      { dia: "2026-11-05", receitas: 15, despesas: 0 },
    ]);
  });

  it("despesas por categoria somam 100% e ordenam", () => {
    const r = despesasPorCategoria(
      [
        l({ direction: "out", amount_cents: 300, account_plan_id: "p1" }),
        l({ direction: "out", amount_cents: 100 }),
        l({ direction: "out", amount_cents: 100, account_plan_id: "p1" }),
      ],
      (id) => (id === "p1" ? "Aluguel" : undefined),
    );
    expect(r.map((x) => x.nome)).toEqual(["Aluguel", "Sem categoria"]);
    expect(r[0]!.percentual).toBeCloseTo(80);
  });

  it("filtra por conta e tipo", () => {
    const i = [l({ id: "a" }), l({ id: "b", account_id: "c2", direction: "out" })];
    expect(filtrarDash(i, { ...FILTROS_DASH_VAZIOS, contaId: "c2" }).map((x) => x.id)).toEqual(["b"]);
  });
});
