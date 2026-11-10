import { describe, expect, it } from "vitest";

import { arquivoPertenceAoVeiculo, fichaDoVeiculo, proximoCodigoDeVeiculo, tituloDoVeiculo, type Veiculo } from "./regras";

const base: Veiculo = {
  id: "v1", codigo: "A1", marca: "Fiat", modelo: "Pulse", categoria: "SUV", versao: "Turbo 200", ano_fabricacao: 2023, ano_modelo: 2024,
  km: 32500, motor: "1.0 turbo", cambio: "automático", combustivel: "Flex", cor: "Branco", placa_final: null,
  preco_cents: 8990000, moeda: "BRL", opcionais: null, descricao: null, status: "disponivel",
  fotos: [], video: null, entrada_em: "2026-11-01", vendido_em: null, created_at: "2026-11-01",
};

describe("veículos", () => {
  it("título com anos distintos", () => {
    expect(tituloDoVeiculo(base)).toBe("Fiat Pulse Turbo 200 2023/2024");
  });
  it("ficha completa", () => {
    const f = fichaDoVeiculo(base);
    expect(f).toContain("1.0 turbo automático");
    expect(f).toContain("32.500 km");
    expect(f).toMatch(/R\$\s?89\.900,00/);
  });
  it("só preço", () => {
    expect(fichaDoVeiculo(base, "preco")).not.toContain("km");
  });
  it("caminho só do próprio veículo", () => {
    const u = "11111111-1111-1111-1111-111111111111";
    expect(arquivoPertenceAoVeiculo(`o/v/${u}.jpg`, "o", "v")).toBe(true);
    expect(arquivoPertenceAoVeiculo(`o/x/${u}.jpg`, "o", "v")).toBe(false);
    expect(arquivoPertenceAoVeiculo(`o/v/${u}.mp4`, "o", "v")).toBe(false);
    expect(arquivoPertenceAoVeiculo(`o/v/${u}.mp4`, "o", "v", "video")).toBe(true);
  });
});

describe("proximoCodigoDeVeiculo", () => {
  it("começa em 0001 e segue o maior + 1", () => {
    expect(proximoCodigoDeVeiculo([])).toBe("0001");
    expect(proximoCodigoDeVeiculo(["0001", "0007", "ABC"])).toBe("0008");
  });
  it("reaproveita vazios depois de 9999 e avisa quando lota", () => {
    expect(proximoCodigoDeVeiculo(["9999", "0001"])).toBe("0002");
    expect(proximoCodigoDeVeiculo(Array.from({ length: 9999 }, (_, i) => String(i + 1)))).toBeNull();
  });
});
