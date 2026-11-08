import { describe, expect, it } from "vitest";
import type { Negociacao } from "@/lib/pdv/regras";
import { diaDaLoja, montarResumo, variacaoPercentual } from "./resumo";

const base = {
  tipo: "venda",
  status: "concluida",
  desconto_cents: 0,
  troca: null,
  pagamentos: [],
} as unknown as Negociacao;
const venda = (o: Partial<Negociacao>): Negociacao => ({ ...base, id: Math.random().toString(), ...o }) as Negociacao;
const AGORA = new Date("2026-11-07T15:00:00Z");
const titulo = (n: Negociacao) => ((n.veiculo ?? {}) as { modelo?: string }).modelo ?? "";

describe("dashboard · resumo", () => {
  it("o dia é o de São Paulo, não o UTC", () => {
    expect(diaDaLoja("2026-11-08T01:30:00Z")).toBe("2026-11-07");
  });

  it("soma hoje e ontem só das vendas concluídas", () => {
    const r = montarResumo(
      [
        venda({ concluida_em: "2026-11-07T13:00:00Z", valor_cents: 100_00, desconto_cents: 10_00, veiculo: { modelo: "Gol" } as never }),
        venda({ concluida_em: "2026-11-06T13:00:00Z", valor_cents: 50_00 }),
        venda({ status: "rascunho", concluida_em: null, created_at: "2026-11-07T13:00:00Z", valor_cents: 999_00 }),
        venda({ tipo: "compra", concluida_em: "2026-11-07T13:00:00Z", valor_cents: 888_00 }),
      ],
      7,
      AGORA,
      titulo,
    );
    expect(r.vendas_hoje).toBe(1);
    expect(r.receita_hoje_cents).toBe(90_00);
    expect(r.vendas_ontem).toBe(1);
    expect(r.receita_ontem_cents).toBe(50_00);
    expect(r.serie).toHaveLength(7);
    expect(r.serie.at(-1)).toMatchObject({ dia: "2026-11-07", vendas: 1 });
  });

  it("separa as formas de pagamento de hoje e a troca líquida", () => {
    const r = montarResumo(
      [
        venda({
          concluida_em: "2026-11-07T13:00:00Z",
          valor_cents: 100_00,
          pagamentos: [{ forma: "pix", valor_cents: 60_00, parcelas: 1 }] as never,
          troca: { valor_cents: 40_00, quitacao_cents: 10_00 } as never,
        }),
      ],
      7,
      AGORA,
      titulo,
    );
    expect(r.formas_hoje).toEqual([
      { forma: "pix", valor_cents: 60_00 },
      { forma: "troca", valor_cents: 30_00 },
    ]);
  });

  it("variação sem base de comparação é null", () => {
    expect(variacaoPercentual(5, 0)).toBeNull();
    expect(variacaoPercentual(150, 100)).toBe(50);
  });
});

describe("montarMes", () => {
  it("vai do dia 1º até hoje e acumula o faturamento", async () => {
    const { montarMes } = await import("./resumo");
    const mk = (dia: string, valor: number) =>
      ({
        tipo: "venda",
        status: "concluida",
        valor_cents: valor,
        desconto_cents: 0,
        concluida_em: `${dia}T15:00:00Z`,
        created_at: `${dia}T15:00:00Z`,
      }) as never;
    const r = montarMes(
      [mk("2026-11-02", 1000), mk("2026-11-05", 500), mk("2026-10-30", 9999)],
      new Date("2026-11-08T15:00:00Z"),
    );
    expect(r.serie).toHaveLength(8);
    expect(r.serie[0]!.dia).toBe("2026-11-01");
    expect(r.receita_cents).toBe(1500);
    expect(r.vendas).toBe(2);
    expect(r.serie[7]!.acumulada_cents).toBe(1500);
  });
});
