import { describe, expect, it } from "vitest";

import { disponivelCents, percentualUsado, somar } from "./cartoes";

describe("cartões", () => {
  it("percentual usado limita em 0–100 e trata limite zero", () => {
    expect(percentualUsado(2500, 10000)).toBe(25);
    expect(percentualUsado(20000, 10000)).toBe(100);
    expect(percentualUsado(0, 0)).toBe(0);
    expect(percentualUsado(1, 0)).toBe(100);
  });
  it("disponível nunca fica negativo", () => {
    expect(disponivelCents(2500, 10000)).toBe(7500);
    expect(disponivelCents(20000, 10000)).toBe(0);
  });
  it("soma", () => expect(somar([1, 2, 3])).toBe(6));
});
