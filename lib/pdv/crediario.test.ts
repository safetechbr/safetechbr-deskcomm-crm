import { describe, it, expect } from "vitest";
import { distribuirParcelas, operacaoCrediarioSchema } from "./crediario";
describe("crediário", () => {
  it("preserva cada centavo e distribui o resto sem arredondar o total", () => {
    expect(distribuirParcelas(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(distribuirParcelas(495000, 4).reduce((a, b) => a + b, 0)).toBe(495000);
  });
  it("não cria parcelas zeradas e valida datas e juros", () => {
    expect(() => distribuirParcelas(1, 2)).toThrow();
    expect(
      operacaoCrediarioSchema.safeParse({
        operacao: "recalcular",
        parcelas: 4,
        vencimento: "2026-02-30",
        juros_bps: 0,
      }).success,
    ).toBe(false);
    expect(
      operacaoCrediarioSchema.safeParse({
        operacao: "recalcular",
        parcelas: 4,
        vencimento: "2026-12-31",
        juros_bps: 250,
      }).success,
    ).toBe(true);
  });
});
