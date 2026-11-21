import { describe, expect, it } from "vitest";
import { dataDoTermo } from "./criar-rascunhos";
import { observacaoDaTroca, validarParaEmitir, validarPessoa, validarVeiculo, type ContextoDeValidacao } from "./rascunho";

const pessoa = {
  nome: "Maria", documento: "52998224725", email: null, cep: "01310100", logradouro: "Av Paulista", numero: "1",
  complemento: null, bairro: "Bela Vista", municipio: "São Paulo", uf: "SP", codigo_municipio: "3550308",
};
const veiculo = {
  marca: "VW", modelo: "Gol", cor: "Prata", chassi: "9BWZZZ377VT004251", placa: "ABC1D23", renavam: "123456789",
  ncm: "87032100", ano_fabricacao: 2018, ano_modelo: 2019, km: 50000,
} as Parameters<typeof validarVeiculo>[0];

const ctx = (o: Partial<ContextoDeValidacao> = {}): ContextoDeValidacao => ({
  operacao: "SAI_VENDA", rascunho: { pessoa, veiculo } as ContextoDeValidacao["rascunho"], valorTotalCents: 5000000,
  entradaAutorizada: true, trocaEntradaNumero: null, temRegraAtiva: true, ...o,
});

describe("dataDoTermo", () => {
  it("ISO + hora", () => expect(dataDoTermo("2026-11-20", "14:30")).toBe("2026-11-20T14:30:00-03:00"));
  it("formato BR, sem hora", () => expect(dataDoTermo("20/11/2026", null)).toBe("2026-11-20T12:00:00-03:00"));
  it("ilegível → null", () => expect(dataDoTermo("xx", "10:00")).toBeNull());
});

describe("observacaoDaTroca", () => {
  it("texto exato", () =>
    expect(observacaoDaTroca("abc1d23", 42)).toBe("Veículo ABC1D23 recebido como parte do pagamento – NF-e de entrada nº 42"));
});

describe("validações", () => {
  it("pessoa e veículo completos passam", () => {
    expect(validarPessoa(pessoa)).toEqual([]);
    expect(validarVeiculo(veiculo)).toEqual([]);
  });
  it("sem IBGE bloqueia", () => expect(validarPessoa({ ...pessoa, codigo_municipio: null })).toHaveLength(1));
  it("chassi curto e NCM ruim bloqueiam", () =>
    expect(validarVeiculo({ ...veiculo, chassi: "123", ncm: "8703" })).toHaveLength(2));
  it("venda sem entrada autorizada bloqueia", () =>
    expect(validarParaEmitir(ctx({ entradaAutorizada: false })).join()).toContain("NF-e de entrada autorizada"));
  it("exceção compra_pj com XML libera a venda", () =>
    expect(validarParaEmitir(ctx({ entradaAutorizada: false, rascunho: { pessoa, veiculo, origem: "compra_pj" } as ContextoDeValidacao["rascunho"] }))).toEqual([]));
  it("troca sem entrada autorizada bloqueia a venda", () =>
    expect(validarParaEmitir(ctx({ rascunho: { pessoa, veiculo, troca_placa: "XYZ9K88" } as ContextoDeValidacao["rascunho"] })).join()).toContain("troca"));
  it("sem regra ativa bloqueia", () => expect(validarParaEmitir(ctx({ temRegraAtiva: false }))).toHaveLength(1));
  it("venda completa passa", () => expect(validarParaEmitir(ctx())).toEqual([]));
});
