import { describe, expect, it } from "vitest";

import { interpretarModeloFipe, marcasDoCatalogo, modelosDaMarca } from "./catalogo";

describe("catálogo de marcas e modelos", () => {
  it("tem as marcas principais", () => {
    const m = marcasDoCatalogo();
    for (const x of ["Fiat", "Chevrolet", "Volkswagen", "Toyota", "Honda", "Hyundai"]) expect(m).toContain(x);
  });
  it("filtra modelos só da marca, ignorando acento e ordem", () => {
    const r = modelosDaMarca("Fiat", "pulse turbo");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((n) => /pulse/i.test(n))).toBe(true);
    expect(modelosDaMarca("Marca inexistente")).toEqual([]);
  });
  it("interpreta o nome FIPE", () => {
    expect(interpretarModeloFipe("Pulse Turbo 200 1.0 Flex 12V Aut.")).toMatchObject({
      modelo: "Pulse", motor: "1.0 turbo", cambio: "Automático", combustivel: "Flex",
    });
    expect(interpretarModeloFipe("Grand Siena Attractive 1.4 Mec.").modelo).toBe("Grand Siena");
  });
});
