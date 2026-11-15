import { describe, expect, it } from "vitest";
import { inteiroPorExtenso, reaisPorExtenso } from "./valor-por-extenso";

describe("valor por extenso", () => {
  it.each([
    [0, "zero"],
    [1, "um"],
    [16, "dezesseis"],
    [21, "vinte e um"],
    [100, "cem"],
    [101, "cento e um"],
    [999, "novecentos e noventa e nove"],
    [1000, "mil"],
    [1001, "mil e um"],
    [1500, "mil e quinhentos"],
    [2320, "dois mil trezentos e vinte"],
    [65_000, "sessenta e cinco mil"],
    [1_000_000, "um milhão"],
    [2_500_000, "dois milhões e quinhentos mil"],
    [1_234_567, "um milhão duzentos e trinta e quatro mil quinhentos e sessenta e sete"],
  ])("%i → %s", (n, esperado) => {
    expect(inteiroPorExtenso(n)).toBe(esperado);
  });

  it.each([
    [8_000_000, "oitenta mil reais"],
    [100, "um real"],
    [150, "um real e cinquenta centavos"],
    [1, "um centavo"],
    [0, "zero real"],
    [100_000_000, "um milhão de reais"],
    [250_000_000, "dois milhões e quinhentos mil reais"],
    [6_340_099, "sessenta e três mil e quatrocentos reais e noventa e nove centavos"],
  ])("%i centavos → %s", (c, esperado) => {
    expect(reaisPorExtenso(c)).toBe(esperado);
  });

  it("recusa negativo e fração", () => {
    expect(() => reaisPorExtenso(-1)).toThrow(RangeError);
    expect(() => reaisPorExtenso(1.5)).toThrow(RangeError);
  });
});
