// @vitest-environment node
// Dados sintéticos.
import { describe, expect, it } from "vitest";

import { extractPdfText } from "@/lib/ai/rag/extractors/pdf";
import { vendaCompleta } from "@/tests/fixtures/negociacao-documentos";

import { manifestoDaPasta } from "./manifesto-da-pasta";
import { faltasDaNota, notasPromissorias, somarMeses, temNotaPromissoria } from "./nota-promissoria";
import { renderNotasPromissoriasPdf } from "./nota-promissoria-pdf";
import type { LancamentoDaVenda } from "./recibo-pagamento";
import type { Negociacao, PagamentoDaNegociacao } from "./regras";
import { retratoDaOperacao } from "./retrato-da-operacao";

const com = (...pagamentos: PagamentoDaNegociacao[]): Negociacao => ({ ...vendaCompleta(), pagamentos });
const pag = (p: Partial<PagamentoDaNegociacao>): PagamentoDaNegociacao =>
  ({ forma: "promissoria", valor_cents: 1_000_00, parcelas: 1, ...p }) as PagamentoDaNegociacao;
const itemDaNota = (n: Negociacao) =>
  manifestoDaPasta(retratoDaOperacao(n)).itens.find((i) => i.documento === "nota_promissoria")!;
const loja = { razaoSocial: "Loja Teste Ltda", nomeFantasia: "Loja Teste", cnpj: "11222333000181", logoUrl: null, cidade: "Campinas" };

describe("parcelas da nota promissória", () => {
  it("divide como o gatilho: sobra de centavos nas primeiras, mês a mês", () => {
    const notas = notasPromissorias(com(pag({ valor_cents: 1000, parcelas: 3, primeiro_vencimento: "2027-01-10" })));
    expect(notas.map((n) => n.valor_cents)).toEqual([334, 333, 333]);
    expect(notas.map((n) => n.vencimento)).toEqual(["2027-01-10", "2027-02-10", "2027-03-10"]);
    expect(notas.map((n) => `${n.numero}/${n.total}`)).toEqual(["1/3", "2/3", "3/3"]);
  });

  it("dia 31 cai no último dia do mês, como no Postgres", () => {
    expect(somarMeses("2027-01-31", 1)).toBe("2027-02-28");
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29");
    expect(somarMeses("2027-01-31", 2)).toBe("2027-03-31");
  });

  it("promissória com intervalo em dias; crediário soma juros", () => {
    const p = notasPromissorias(com(pag({ valor_cents: 2000, parcelas: 2, primeiro_vencimento: "2027-01-01", intervalo_dias: 15 })));
    expect(p.map((n) => n.vencimento)).toEqual(["2027-01-01", "2027-01-16"]);
    const c = notasPromissorias(com(pag({ forma: "crediario", valor_cents: 10_000, parcelas: 2, juros_bps: 1000, primeiro_vencimento: "2027-01-05" })));
    expect(c.map((n) => n.valor_cents)).toEqual([5500, 5500]);
  });

  it("total menor que a quantidade vira uma parcela só", () => {
    expect(notasPromissorias(com(pag({ valor_cents: 2, parcelas: 5, primeiro_vencimento: "2027-01-01" })))).toHaveLength(1);
  });

  it("boleto e cheque não geram nota", () => {
    const n = com(pag({ forma: "boleto", parcelas: 3 }), pag({ forma: "cheque", parcelas: 2 }));
    expect(temNotaPromissoria(n)).toBe(false);
    expect(notasPromissorias(n)).toEqual([]);
  });

  it("concluída: valem os lançamentos; parcela paga leva a data da quitação", () => {
    const n = com(pag({ valor_cents: 2000, parcelas: 2, primeiro_vencimento: "2027-01-01" }));
    const l = (id: string, due: string, paid: string | null): LancamentoDaVenda => ({
      id, forma_pagamento: "promissoria", amount_cents: 999, status: paid ? "paid" : "pending", paid_at: paid,
      parcela_numero: null, parcela_total: null, due_date: due,
    });
    const pix: LancamentoDaVenda = { ...l("p", "2026-11-20", "2026-11-20T15:00:00Z"), forma_pagamento: "pix" };
    const notas = notasPromissorias(n, [pix, l("b", "2027-02-01", null), l("a", "2027-01-01", "2027-01-02T12:00:00Z")]);
    expect(notas.map((x) => [x.numero, x.vencimento, x.valor_cents, x.paga_em])).toEqual([
      [1, "2027-01-01", 999, "2027-01-02T12:00:00Z"],
      [2, "2027-02-01", 999, null],
    ]);
  });
});

describe("faltas e manifesto", () => {
  it("dados completos: pronto; sem CPF ou vencimento: bloqueia", () => {
    const ok = com(pag({ parcelas: 2, primeiro_vencimento: "2027-01-01" }));
    expect(faltasDaNota(ok, loja)).toEqual([]);
    expect(itemDaNota(ok)).toMatchObject({ aplicacao: "aplica", situacao: "pronto" });

    const sem = { ...com(pag({ forma: "crediario" })), cliente: { ...ok.cliente, documento: "" } };
    expect(faltasDaNota(sem, loja).map((f) => f.campo)).toEqual(["cliente.documento", "pagamentos.primeiro_vencimento"]);
    expect(itemDaNota(sem)).toMatchObject({ aplicacao: "aplica", situacao: "faltam_dados" });
  });

  it("boleto: não se aplica, o próprio título cobre a parcela", () => {
    const item = itemDaNota(com(pag({ forma: "boleto", parcelas: 3, primeiro_vencimento: "2027-01-01" })));
    expect(item.aplicacao).toBe("nao_aplica");
    expect(item.motivo).toMatch(/boleto ou cheque/);
  });

  it("só à vista: não se aplica", () => {
    expect(itemDaNota(vendaCompleta()).aplicacao).toBe("nao_aplica");
  });
});

describe("PDF da nota promissória", () => {
  const textoDo = async (buf: Buffer) => (await extractPdfText(buf)).replace(/\s+/g, " ");

  it("frente com requisitos e verso de quitação para a parcela paga", async () => {
    const n = com(pag({ valor_cents: 150_000, parcelas: 2, primeiro_vencimento: "2027-01-10" }));
    const [a, b] = notasPromissorias(n);
    const t = await textoDo(await renderNotasPromissoriasPdf({ negociacao: n, loja, notas: [{ ...a!, paga_em: "2027-01-10T15:00:00Z" }, b!] }));
    expect(t).toContain("NOTA PROMISSÓRIA Nº 1/2");
    expect(t).toContain("NÃO À ORDEM");
    expect(t).toContain("10/01/2027");
    expect(t).toContain("setecentos e cinquenta reais");
    expect(t).toContain("11.222.333/0001-81");
    expect(t).toContain("DEVOLVER O ORIGINAL AO CLIENTE");
    expect(t).toContain("não acrescenta juros nem multa");
    expect(t.match(/DEVOLVER O ORIGINAL/g)).toHaveLength(1);
  });
});
