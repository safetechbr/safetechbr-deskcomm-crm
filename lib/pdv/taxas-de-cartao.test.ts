import { describe, expect, it } from "vitest";

import { pagamentoSchema } from "./regras";
import { calcularCartao, lerTaxasDeCartao, perfilDoCartao, taxasDeCartaoSchema } from "./taxas-de-cartao";

describe("taxas de cartão do PDV", () => {
  it("preserva o líquido desejado ao repassar e reduz o líquido ao absorver", () => {
    expect(calcularCartao(10000, 500, "repassar", 1)).toEqual({
      cobrado: 10526, liquido: 10000, parcela: 10526,
    });
    expect(calcularCartao(10000, 500, "absorver", 2)).toEqual({
      cobrado: 10000, liquido: 9500, parcela: 5000,
    });
  });

  it("preserva a taxa e o repasse no pagamento salvo e aceita registros antigos", () => {
    const base = { forma: "cartao_credito", valor_cents: 10000, parcelas: 2 };
    expect(pagamentoSchema.parse(base)).toEqual(base);
    const pagamento = { ...base, perfil_cartao_id: "principal", taxa_cartao_bps: 500, repasse_cartao: "absorver" };
    expect(pagamentoSchema.parse(pagamento)).toEqual(pagamento);
    expect(pagamentoSchema.safeParse({ ...pagamento, taxa_cartao_bps: 10000 }).success).toBe(false);
  });

  it("começa sem perfis e aceita salvar a configuração vazia", () => {
    const vazio = { padrao: null, perfis: [] };
    expect(lerTaxasDeCartao(undefined)).toEqual(vazio);
    expect(taxasDeCartaoSchema.parse(vazio)).toEqual(vazio);
    expect(perfilDoCartao(vazio, undefined)).toBeUndefined();
  });

  it("preserva o perfil selecionado ao salvar configurações antigas ou reordenar perfis", () => {
    const perfis = [
      { nome: "Geral", bandeira: "", debito: 200, credito: [500] },
      { nome: "Visa", bandeira: "Visa", debito: 100, credito: [300, 456] },
    ];
    const config = lerTaxasDeCartao({ taxas_de_cartao: { padrao: 0, perfis } });
    const selecionado = config.perfis[1];
    expect(selecionado).toMatchObject({ id: "legado-1", nome: "Visa" });
    const reordenado = taxasDeCartaoSchema.parse({ padrao: 1, perfis: [...config.perfis].reverse() });
    expect(perfilDoCartao(reordenado, selecionado?.id)).toEqual(selecionado);
    expect(perfilDoCartao(reordenado, undefined)).toBeUndefined();
  });
});
