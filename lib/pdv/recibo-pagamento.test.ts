import { describe, expect, it } from "vitest";

import { comTroca, vendaCompleta } from "@/tests/fixtures/negociacao-documentos";

import {
  linhasDaQuitacao,
  saldoAposRecibo,
  situacaoDaQuitacao,
  type LancamentoDaVenda,
  type ReciboDePagamento,
} from "./recibo-pagamento";

const T0 = "2026-11-20T15:00:00.000Z";
const T1 = "2026-12-20T15:00:00.000Z";

const lanc = (id: string, forma: string, cents: number, paid_at: string | null, p?: [number, number]) =>
  ({
    id,
    forma_pagamento: forma,
    amount_cents: cents,
    status: paid_at ? "paid" : "pending",
    paid_at,
    parcela_numero: p?.[0] ?? null,
    parcela_total: p?.[1] ?? null,
  }) satisfies LancamentoDaVenda;

const rec = (numero: number, l: LancamentoDaVenda): ReciboDePagamento => ({
  numero,
  lancamento_id: l.id,
  valor_cents: l.amount_cents,
  forma_pagamento: l.forma_pagamento,
  parcela_numero: l.parcela_numero,
  parcela_total: l.parcela_total,
  recebido_em: l.paid_at!,
});

describe("saldo após o recibo", () => {
  it("lançamentos do mesmo instante desempatam pelo número do recibo", () => {
    const pix = lanc("a", "pix", 1_000_000, T0);
    const dinheiro = lanc("b", "dinheiro", 500_050, T0);
    const boleto = lanc("c", "boleto", 250_000, null, [1, 2]);
    const todos = [pix, dinheiro, boleto];
    const recibos = [rec(7, pix), rec(8, dinheiro)];
    expect(saldoAposRecibo(recibos[0]!, todos, recibos)).toBe(750_050);
    expect(saldoAposRecibo(recibos[1]!, todos, recibos)).toBe(250_000);
  });

  it("parcela paga depois não muda o saldo de um recibo antigo", () => {
    const pix = lanc("a", "pix", 1_000_000, T0);
    const p1 = lanc("c", "boleto", 250_000, T1, [1, 2]);
    const p2 = lanc("d", "boleto", 250_000, null, [2, 2]);
    const recibos = [rec(1, pix), rec(2, p1)];
    expect(saldoAposRecibo(recibos[0]!, [pix, p1, p2], recibos)).toBe(500_000);
    expect(saldoAposRecibo(recibos[1]!, [pix, p1, p2], recibos)).toBe(250_000);
  });

  it("financiamento pago no mesmo instante, sem recibo, já conta como pago", () => {
    const fin = lanc("f", "financiamento", 6_000_000, T0);
    const pix = lanc("a", "pix", 500_000, T0);
    const recibos = [rec(3, pix)];
    expect(saldoAposRecibo(recibos[0]!, [fin, pix], recibos)).toBe(0);
  });
});

describe("situação da quitação", () => {
  const concluida = { ...vendaCompleta(), status: "concluida" as const };

  it("quita só com a venda concluída e nada pendente, banco incluso", () => {
    const pix = lanc("a", "pix", 500_000, T0);
    const fin = lanc("f", "financiamento", 6_000_000, null);
    expect(situacaoDaQuitacao(concluida, [pix, fin])).toEqual({ quitada: false, pendente_cents: 6_000_000 });
    expect(situacaoDaQuitacao(concluida, [pix, { ...fin, status: "paid", paid_at: T1 }])).toEqual({
      quitada: true,
      pendente_cents: 0,
    });
    expect(situacaoDaQuitacao({ ...concluida, status: "rascunho" }, [pix]).quitada).toBe(false);
    expect(situacaoDaQuitacao(concluida, []).quitada).toBe(false);
  });
});

describe("tabela do termo de quitação", () => {
  it("troca como compensação, banco sem recibo e recibos em ordem somam o preço", () => {
    const n = { ...comTroca(vendaCompleta()), status: "concluida" as const };
    const fin = lanc("f", "financiamento", 6_000_000, T1);
    const pix = lanc("a", "pix", 500_000, T0);
    const linhas = linhasDaQuitacao(n, [fin, pix], [rec(12, pix)]);
    expect(linhas.map((l) => [l.descricao, l.referencia, l.valor_cents])).toEqual([
      ["Veículo recebido na troca (compensação no preço)", "—", 1_500_000],
      ["Financiamento bancário", "Banco Exemplo", 6_000_000],
      ["PIX", "Recibo nº 12", 500_000],
    ]);
    expect(linhas.reduce((s, l) => s + l.valor_cents, 0)).toBe(n.valor_cents);
  });
});
