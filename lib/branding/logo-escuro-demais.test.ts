import { describe, expect, it } from "vitest";

import { logoEscuroDemais } from "./logo-escuro-demais";

const px = (r: number, g: number, b: number, a = 255) => [r, g, b, a];

describe("logoEscuroDemais", () => {
  it("preto e azul-marinho sem fundo → escuro demais", () => {
    expect(logoEscuroDemais(new Uint8ClampedArray([...px(0, 0, 0), ...px(10, 20, 60)]))).toBe(true);
  });
  it("vermelho vivo do M Auto → não inverte", () => {
    expect(logoEscuroDemais(new Uint8ClampedArray([...px(220, 20, 30), ...px(200, 10, 20)]))).toBe(
      false,
    );
  });
  it("o transparente não pesa: pouco preto + muito transparente continua escuro", () => {
    const lixo = Array.from({ length: 50 }, () => px(255, 255, 255, 0)).flat();
    expect(logoEscuroDemais(new Uint8ClampedArray([...px(0, 0, 0), ...lixo]))).toBe(true);
  });
  it("arte clara ou vazia → não inverte", () => {
    expect(logoEscuroDemais(new Uint8ClampedArray(px(255, 255, 255)))).toBe(false);
    expect(logoEscuroDemais(new Uint8ClampedArray(px(0, 0, 0, 0)))).toBe(false);
  });
});
