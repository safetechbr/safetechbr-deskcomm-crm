import { describe, expect, it } from "vitest";

import {
  agruparPorDia,
  calcularTotais,
  filtrar,
  FILTROS_VAZIOS,
  intervaloDoMes,
  mesAnterior,
  mesSeguinte,
  type Movimentacao,
} from "./movimentacoes";

const m = (p: Partial<Movimentacao>): Movimentacao => ({
  id: "x",
  account_id: "c1",
  account_plan_id: null,
  direction: "in",
  amount_cents: 100,
  description: null,
  entry_date: "2026-11-09",
  status: "paid",
  origin: "manual",
  ...p,
});

describe("movimentações do financeiro", () => {
  it("intervalo do mês cobre fevereiro bissexto e dezembro", () => {
    expect(intervaloDoMes(2028, 2)).toEqual({ de: "2028-02-01", ate: "2028-02-29" });
    expect(intervaloDoMes(2026, 12).ate).toBe("2026-12-31");
  });

  it("navega entre meses virando o ano", () => {
    expect(mesAnterior(2026, 1)).toEqual({ ano: 2025, mes: 12 });
    expect(mesSeguinte(2026, 12)).toEqual({ ano: 2027, mes: 1 });
  });

  it("separa pago de pendente nos quatro totais", () => {
    const t = calcularTotais([
      m({ amount_cents: 1000 }),
      m({ amount_cents: 500, status: "pending" }),
      m({ direction: "out", amount_cents: 300 }),
      m({ direction: "out", amount_cents: 200, status: "pending" }),
    ]);
    expect(t).toEqual({
      receitas: 1000,
      receitasPendentes: 500,
      despesas: 300,
      despesasPendentes: 200,
    });
  });

  it("filtra por tipo, status, plano e conta", () => {
    const itens = [
      m({ id: "a" }),
      m({ id: "b", direction: "out", account_plan_id: "p1" }),
      m({ id: "c", status: "pending", account_id: "c2" }),
    ];
    expect(filtrar(itens, { ...FILTROS_VAZIOS, direction: "out" }).map((i) => i.id)).toEqual(["b"]);
    expect(filtrar(itens, { ...FILTROS_VAZIOS, status: "pending" }).map((i) => i.id)).toEqual(["c"]);
    expect(filtrar(itens, { ...FILTROS_VAZIOS, planoId: "p1" }).map((i) => i.id)).toEqual(["b"]);
    expect(filtrar(itens, { ...FILTROS_VAZIOS, contaId: "c2" }).map((i) => i.id)).toEqual(["c"]);
  });

  it("agrupa por dia, do mais recente ao mais antigo", () => {
    const g = agruparPorDia([
      m({ id: "a", entry_date: "2026-11-02" }),
      m({ id: "b", entry_date: "2026-11-09" }),
      m({ id: "c", entry_date: "2026-11-09" }),
    ]);
    expect(g.map((x) => x.dia)).toEqual(["2026-11-09", "2026-11-02"]);
    expect(g[0]!.itens.map((i) => i.id)).toEqual(["b", "c"]);
  });
});
