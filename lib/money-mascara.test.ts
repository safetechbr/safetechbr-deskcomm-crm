import { describe, it, expect } from "vitest";
import { centavosParaMascara, mascararMoeda, parseReaisToCents } from "./money";
import { precoParaCentavos } from "./schemas/produtos";

describe("mascararMoeda — ponto e vírgula aparecem enquanto digita", () => {
  it("os dígitos entram pela direita como centavos (BRL)", () => {
    expect(mascararMoeda("1")).toBe("0,01");
    expect(mascararMoeda("10")).toBe("0,10");
    expect(mascararMoeda("100")).toBe("1,00");
    expect(mascararMoeda("10000")).toBe("100,00");
    expect(mascararMoeda("123456")).toBe("1.234,56");
    expect(mascararMoeda("123456789")).toBe("1.234.567,89");
  });

  it("re-mascara o texto já mascarado + um dígito novo", () => {
    expect(mascararMoeda("1.234,567")).toBe("12.345,67");
    expect(mascararMoeda("0,012")).toBe("0,12");
    expect(mascararMoeda("1.234,5")).toBe("123,45"); // apagou o último
  });

  it("vazio ou sem dígito fica vazio (placeholder aparece)", () => {
    expect(mascararMoeda("")).toBe("");
    expect(mascararMoeda("R$ ")).toBe("");
    expect(mascararMoeda("0,0")).toBe(""); // backspace em "0,00"
  });

  it("digitar 0 declara zero, e não apaga", () => {
    expect(mascararMoeda("0")).toBe("0,00");
    expect(mascararMoeda("0,000")).toBe("0,00");
    expect(mascararMoeda("0,001")).toBe("0,01");
  });

  it("usa os separadores da moeda", () => {
    expect(mascararMoeda("123456", "USD")).toBe("1,234.56");
  });

  it("volta a centavos pelos parsers do sistema", () => {
    for (const c of [1, 99, 100, 123456, 987654321]) {
      const t = centavosParaMascara(c);
      expect(parseReaisToCents(t)).toBe(c);
      expect(precoParaCentavos(t)).toBe(c);
      expect(parseReaisToCents(centavosParaMascara(c, "USD"), "USD")).toBe(c);
    }
  });

  it("centavosParaMascara: nulo/zero vira vazio", () => {
    expect(centavosParaMascara(null)).toBe("");
    expect(centavosParaMascara(0)).toBe("");
    expect(centavosParaMascara(150000)).toBe("1.500,00");
  });
});
