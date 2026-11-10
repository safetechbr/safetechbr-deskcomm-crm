import { describe, expect, it } from "vitest";
import { listaDeCategorias, sugerirCategoria } from "./categorias";

describe("sugerirCategoria", () => {
  it.each([
    ["Onix Plus 1.0 Turbo", "Sedã"],
    ["Onix 1.0 LT", "Hatch"],
    ["Compass Longitude", "SUV"],
    ["Jeep Compass", "SUV"],
    ["Hilux CD 4x4", "Picape"],
    ["Palio Weekend", "Perua"],
    ["Fiorino Endurance", "Utilitário"],
    ["Spin LTZ", "Minivan"],
    ["Focus ST", "Esportivo"],
    ["Grand Vitara 2.0", "SUV"],
  ])("%s → %s", (modelo, categoria) => {
    expect(sugerirCategoria(null, modelo)).toBe(categoria);
  });

  it("devolve null quando o modelo não é conhecido", () => {
    expect(sugerirCategoria(null, "Zzxq 3000")).toBeNull();
    expect(sugerirCategoria(null, "")).toBeNull();
  });
});

describe("listaDeCategorias", () => {
  it("junta padrão e da loja sem repetir", () => {
    const l = listaDeCategorias(["suv", "Off-road", " off-road "]);
    expect(l.filter((c) => c.toLowerCase() === "suv")).toHaveLength(1);
    expect(l).toContain("Off-road");
    expect(l.filter((c) => c.toLowerCase().includes("off")).length).toBe(1);
  });
});
