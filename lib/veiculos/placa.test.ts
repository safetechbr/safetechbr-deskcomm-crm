import { describe, expect, it } from "vitest";

import { lerRespostaDaPlaca, normalizarPlaca, placaValida } from "./placa";

describe("placa", () => {
  it("normaliza", () => {
    expect(normalizarPlaca("abc-1d23")).toBe("ABC1D23");
    expect(normalizarPlaca("abc 1234 xx")).toBe("ABC1234");
  });
  it("valida antiga e Mercosul", () => {
    expect(placaValida("ABC1234")).toBe(true);
    expect(placaValida("ABC1D23")).toBe(true);
    expect(placaValida("AB12345")).toBe(false);
    expect(placaValida("ABC12")).toBe(false);
  });
  it("lê a resposta básica", () => {
    const r = lerRespostaDaPlaca({
      error: false,
      basico: { error: false, dados: { marca: "VW", modelo: "GOL", ano: "2019", cor: "Branca", municipio: "SP", uf: "SP" } },
    });
    expect(r).toMatchObject({ marca: "VW", modelo: "GOL", ano_fabricacao: 2019, ano_modelo: 2019, cor: "Branca" });
  });
  it("recusa erro e formato inesperado", () => {
    expect(lerRespostaDaPlaca({ error: true })).toBeNull();
    expect(lerRespostaDaPlaca({ basico: { error: true, dados: {} } })).toBeNull();
    expect(lerRespostaDaPlaca("x")).toBeNull();
  });
});
