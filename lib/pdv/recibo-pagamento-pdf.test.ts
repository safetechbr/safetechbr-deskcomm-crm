// @vitest-environment node
// Lê o texto do PDF com o mesmo extrator da produção. Dados sintéticos.
import { describe, expect, it } from "vitest";

import { extractPdfText } from "@/lib/ai/rag/extractors/pdf";
import { comTroca, vendaCompleta } from "@/tests/fixtures/negociacao-documentos";

import type { LancamentoDaVenda, ReciboDePagamento } from "./recibo-pagamento";
import { renderQuitacaoPdf, renderReciboPdf } from "./recibo-pagamento-pdf";
import type { Negociacao } from "./regras";

const loja = { razaoSocial: "Loja Teste Ltda", nomeFantasia: "Loja Teste", cnpj: null, logoUrl: null, cidade: "Campinas" };
const T0 = "2026-11-20T15:00:00.000Z";
const n: Negociacao = { ...comTroca(vendaCompleta()), status: "concluida", concluida_em: T0 };

const fin: LancamentoDaVenda = {
  id: "f", forma_pagamento: "financiamento", amount_cents: 6_000_000, status: "paid", paid_at: T0,
  parcela_numero: null, parcela_total: null,
};
const pix: LancamentoDaVenda = { ...fin, id: "a", forma_pagamento: "pix", amount_cents: 500_000 };
const recibo: ReciboDePagamento = {
  numero: 12, lancamento_id: "a", valor_cents: 500_000, forma_pagamento: "pix",
  parcela_numero: null, parcela_total: null, recebido_em: T0,
};

const textoDo = async (buf: Buffer) => (await extractPdfText(buf)).replace(/\s+/g, " ");

describe("PDF do recibo e da quitação", () => {
  it("recibo mostra número, valor por extenso, saldo zero e campos em branco como —", async () => {
    const t = await textoDo(await renderReciboPdf({ negociacao: n, loja, recibo, lancamentos: [fin, pix], recibos: [recibo] }));
    expect(t).toContain("RECIBO DE PAGAMENTO Nº 12");
    expect(t).toContain("cinco mil reais");
    expect(t).toMatch(/Saldo a receber após este recibo: R\$\s?0,00/);
    expect(t).toContain("Pago por terceiro: —");
    expect(t).toContain("termo próprio");
  });

  it("termo lista troca, banco e recibo e limita a quitação ao preço", async () => {
    const t = await textoDo(await renderQuitacaoPdf({ negociacao: n, loja, lancamentos: [fin, pix], recibos: [recibo] }));
    expect(t).toContain("TERMO DE QUITAÇÃO TOTAL");
    expect(t).toContain("compensação no preço");
    expect(t).toContain("Banco Exemplo");
    expect(t).toContain("Recibo nº 12");
    expect(t).toContain("alcança somente o preço");
  });
});
