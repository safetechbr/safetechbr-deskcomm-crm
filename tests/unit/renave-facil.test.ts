import { describe, expect, it, vi } from "vitest";

import { RenaveErro } from "@/lib/renave/tipos";
import { chaveNfeValida, cnpjValido, dataHoraLocal, mascararChaveNfe, montarVeiculo, pendenciasDeEnvio } from "@/lib/renave/validacao";
import { corpoNfe, criarRenaveFacil } from "@/lib/renave/renave-facil";
import { esperaMs, repetivel } from "@/lib/renave/renave-facil/http";

const json = (status: number, corpo?: unknown) =>
  new Response(corpo === undefined ? "" : JSON.stringify(corpo), { status });

function api(respostas: Response[]) {
  const fetchImpl = vi.fn(async () => respostas.shift() ?? json(500));
  const dormir = vi.fn(async () => {});
  return { fetchImpl, dormir, r: criarRenaveFacil({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, dormir }) };
}

// Chave sintética com DV correto (calculado abaixo).
function chaveComDv(base43: string): string {
  let soma = 0, peso = 2;
  for (let i = 42; i >= 0; i--) { soma += Number(base43[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const resto = soma % 11;
  return base43 + String(resto < 2 ? 0 : 11 - resto);
}
const CHAVE = chaveComDv("3526111234567800019955001000000001100000001".slice(0, 43).padEnd(43, "1"));

const nfe = { chassi: "9BWZZZ377VT004251", tipoVeiculo: "U" as const, chaveNfe: CHAVE, cpfCnpj: "529.982.247-25", dtHrProcesso: "2026-11-21T10:00:00", valor: 45000.5 };

describe("validação", () => {
  it("chave da NF-e: 44 dígitos e DV", () => {
    expect(chaveNfeValida(CHAVE)).toBe(true);
    expect(chaveNfeValida(CHAVE.slice(0, 43) + ((Number(CHAVE[43]) + 1) % 10))).toBe(false);
    expect(chaveNfeValida("123")).toBe(false);
    expect(mascararChaveNfe(CHAVE)).toBe(CHAVE.replace(/(\d{4})(?=\d)/g, "$1 "));
  });
  it("CNPJ com DV", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
  });
  it("data local sem Z", () => {
    expect(dataHoraLocal(new Date("2026-11-21T13:00:00Z"), "America/Sao_Paulo")).toBe("2026-11-21T10:00:00");
  });
  it("pendências em português", () => {
    const f = pendenciasDeEnvio({}, null, "x");
    expect(f.join(" ")).toMatch(/chassi/);
    expect(f.join(" ")).toMatch(/chave da NF-e/);
    expect(pendenciasDeEnvio({ chassi: "9BWZZZ377VT004251", placa: "MDB4D21", renavam: "87625135046", ano_fabricacao: 2020, ano_modelo: 2021 },
      { nome: "A", documento: "52998224725", cep: "64000000", logradouro: "R", numero: "1", bairro: "B", municipio: "C", uf: "PI" }, CHAVE)).toEqual([]);
  });
  it("monta veículo normalizado", () => {
    expect(montarVeiculo({ chassi: " 9bwzzz377vt004251 ", placa: "mdb-4d21", renavam: "876.251", marca: "vw", modelo: "gol", ano_fabricacao: 2020, ano_modelo: 2021 }))
      .toMatchObject({ chassi: "9BWZZZ377VT004251", placa: "MDB4D21", renavam: "876251", descricao: "VW GOL", tipoVeiculo: "U" });
  });
});

describe("payload", () => {
  it("NF-e: dígitos, valor com 2 casas, sem Z", () => {
    const c = corpoNfe(nfe);
    expect(c).toMatchObject({ cpfCnpj: "52998224725", chaveNfe: CHAVE, valor: 45000.5, dtHrProcesso: "2026-11-21T10:00:00" });
  });
});

describe("cliente HTTP", () => {
  it("manda Bearer e não repete 4xx", async () => {
    const { r, fetchImpl, dormir } = api([json(403, { message: "x" })]);
    await expect(r.verificarEstabelecimento("11222333000181")).rejects.toMatchObject({ codigo: "renave_nao_vinculado", status: 403 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(dormir).not.toHaveBeenCalled();
    const init = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init[0]).toBe("https://api.renavefacil.net/v2/integration/company/11222333000181/check");
    expect((init[1].headers as Record<string, string>).Authorization).toBe("Bearer k");
  });
  it("repete 5xx até 3 vezes e depois falha", async () => {
    const { r, fetchImpl, dormir } = api([json(500), json(502), json(503)]);
    await expect(r.consultarCreditos("11222333000181")).rejects.toMatchObject({ codigo: "renave_indisponivel" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(dormir).toHaveBeenCalledTimes(2);
  });
  it("repete 429 e recupera", async () => {
    const { r } = api([json(429), json(200, { cadastrado: true, confirmado: true, vinculado: true })]);
    await expect(r.verificarEstabelecimento("11222333000181")).resolves.toEqual({ cadastrado: true, confirmado: true, vinculado: true });
  });
  it("timeout/rede vira renave_indisponivel e repete", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(json(200, { cadastrado: true, confirmado: false, vinculado: false }));
    const r = criarRenaveFacil({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, dormir: async () => {} });
    await expect(r.verificarEstabelecimento("11222333000181")).resolves.toMatchObject({ vinculado: false });
  });
  it("resposta fora do schema falha em vez de passar lixo", async () => {
    const { r } = api([json(200, { nada: 1 })]);
    await expect(r.verificarEstabelecimento("11222333000181")).rejects.toBeInstanceOf(RenaveErro);
  });
  it("mapeia 401/404/409/400", () => {
    expect(repetivel(new RenaveErro("renave_auth", 401, ""))).toBe(false);
    expect(esperaMs(0, () => 0)).toBe(500);
    expect(esperaMs(2, () => 0)).toBe(2000);
  });
  it("não loga a chave de API nem corpo", async () => {
    const reg = vi.fn();
    const f = vi.fn(async () => json(200, { cadastrado: true, confirmado: true, vinculado: true }));
    const r = criarRenaveFacil({ apiKey: "segredo", fetchImpl: f as unknown as typeof fetch, registrar: reg });
    await r.verificarEstabelecimento("11222333000181");
    expect(JSON.stringify(reg.mock.calls)).not.toContain("segredo");
    expect(reg.mock.calls[0]![0].endpoint).toBe("GET /company/:cnpj/check");
  });
});

describe("upsert", () => {
  it("POST 409 → PUT", async () => {
    const { r, fetchImpl } = api([json(409, { message: "ja" }), json(200)]);
    await r.enviarVeiculo("11222333000181", montarVeiculo({ chassi: "9BWZZZ377VT004251", placa: "MDB4D21", renavam: "87625135046", marca: "VW", modelo: "GOL", ano_fabricacao: 2020, ano_modelo: 2021 }));
    expect((fetchImpl.mock.calls as unknown as [string, RequestInit][]).map((c) => c[1].method)).toEqual(["POST", "PUT"]);
    expect((fetchImpl.mock.calls[1] as unknown as [string])[0]).toContain("/vehicle/9BWZZZ377VT004251/U");
  });
  it("cliente: PUT aceita 201 e não manda id/tipoPessoa", async () => {
    const { r, fetchImpl } = api([json(409), json(201)]);
    await r.enviarCliente("11222333000181", { id: "529.982.247-25", razaoSocial: "A", cep: "64000-000", logradouro: "R", numero: "1", bairro: "B", cidade: "C", uf: "PI" });
    const put = JSON.parse(String((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(put.id).toBeUndefined();
    expect(put.tipoPessoa).toBeUndefined();
    expect(put.cep).toBe("64000000");
  });
});

describe("status e documentos", () => {
  it("lê situação e documentos", async () => {
    const { r } = api([json(200, { chassi: "X", placa: "MDB4D21", renavam: "1", descricao: "d", estoqueRenave: true, situacaoEstoqueRenave: "C", documentosDisponiveis: { termoEntrada: true, atpvEntrada: false, crlv: true, termoSaida: false, atpvSaida: false } })]);
    const s = await r.consultarStatus("11222333000181", { placa: "MDB4D21", renavam: "87625135046" });
    expect(s.situacao).toBe("C");
    expect(s.documentos.crlv).toBe(true);
  });
  it("ATPV-e de entrada ausente (404) não é erro", async () => {
    const { r } = api([json(404, { message: "x" })]);
    await expect(r.baixarDocumento("11222333000181", { placa: "A", renavam: "1" }, "atpve_entrada")).resolves.toBeNull();
  });
  it("CRLV-e devolve dois PDFs", async () => {
    const { r } = api([json(200, { pdfCrlveBase64: "AAA", pdfCodigoSegurancaCrvBase64: "BBB" })]);
    const d = await r.baixarDocumento("11222333000181", { placa: "A", renavam: "1" }, "crlve");
    expect(d?.pdfs.map((p) => p.nome)).toEqual(["crlve", "codigo-seguranca-crv"]);
  });
  it("créditos de lista", async () => {
    const { r } = api([json(200, [{ cnpj: "11222333000181", creditosSeminovos: 7, creditosZeroKm: 1 }])]);
    await expect(r.consultarCreditos("11.222.333/0001-81")).resolves.toEqual({ cnpj: "11222333000181", seminovos: 7, zeroKm: 1 });
  });
});
