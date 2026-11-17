import { describe, expect, it } from "vitest";

import { custoTotalDoVeiculo, liberarSchema, osSchema, totalDosReparos } from "./regras";

describe("oficina — custos", () => {
  it("custo total = compra + reparos", () => {
    const itens = [{ valor_cents: 150000 }, { valor_cents: 35050 }];
    expect(totalDosReparos(itens)).toBe(185050);
    expect(custoTotalDoVeiculo(6000000, itens)).toBe(6185050);
  });
  it("sem custo de compra nem reparos é zero", () => {
    expect(custoTotalDoVeiculo(null, [])).toBe(0);
    expect(custoTotalDoVeiculo(undefined, [{ valor_cents: 100 }])).toBe(100);
  });
});

describe("oficina — validação", () => {
  it("OS aceita itens em centavos inteiros", () => {
    expect(
      osSchema.safeParse({ itens: [{ descricao: " Pastilha ", valor_cents: 12000 }] }).success,
    ).toBe(true);
  });
  it("rejeita valor negativo, fracionado ou descrição vazia", () => {
    expect(osSchema.safeParse({ itens: [{ descricao: "x", valor_cents: -1 }] }).success).toBe(
      false,
    );
    expect(osSchema.safeParse({ itens: [{ descricao: "x", valor_cents: 1.5 }] }).success).toBe(
      false,
    );
    expect(osSchema.safeParse({ itens: [{ descricao: "  ", valor_cents: 1 }] }).success).toBe(
      false,
    );
  });
  it("liberar: preço opcional, mas positivo quando vem", () => {
    expect(liberarSchema.safeParse({}).success).toBe(true);
    expect(liberarSchema.safeParse({ preco_cents: 0 }).success).toBe(false);
  });
});
