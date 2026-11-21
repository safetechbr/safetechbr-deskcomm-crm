import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizarTelefone } from "@/lib/fiscal/entrega";
import { itemParaFocus } from "@/lib/fiscal/focus/mapear";
import { destinatarioIe } from "@/lib/fiscal/rascunho";
import { dataHoraLocal, enviarAoRenave, montarCorpo, operacaoRenave } from "@/lib/renave/client";
import { backoffMs, renavePermitido } from "@/lib/renave/fila";

describe("renave", () => {
  it("mapeia operação fiscal para purchase/sales", () => {
    expect(operacaoRenave("SAI_VENDA")).toBe("sales");
    expect(operacaoRenave("ENT_COMPRA_PF")).toBe("purchase");
    expect(operacaoRenave("ENT_TROCA")).toBe("purchase");
    expect(operacaoRenave("OUTRA")).toBeNull();
  });
  it("monta o corpo completo e isola a caixa de valor/Valor", () => {
    const d = { chave: "k", valorCents: 1234, chassi: "C", cpfCnpj: "123.456.789-09", dtHrProcesso: "2026-01-02T03:04:05" };
    const base = { chassi: "C", tipoVeiculo: "U", chaveNfe: "k", cpfCnpj: "12345678909", dtHrProcesso: "2026-01-02T03:04:05" };
    expect(montarCorpo("purchase", d)).toEqual({ ...base, valor: 12.34 });
    expect(montarCorpo("sales", d)).toEqual({ ...base, Valor: 12.34 });
  });
  it("data local sem Z", () => {
    expect(dataHoraLocal(new Date("2026-01-02T15:04:05Z"))).toBe("2026-01-02T12:04:05");
  });
  it("só produção vai ao Renave", () => {
    expect(renavePermitido("producao")).toBe(true);
    expect(renavePermitido("homologacao")).toBe(false);
    expect(renavePermitido(undefined)).toBe(false);
  });
  it("backoff dobra e tem teto de 6h", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(3)).toBe(240_000);
    expect(backoffMs(30)).toBe(6 * 3_600_000);
  });
});

describe("entrega", () => {
  it("normaliza telefone BR", () => {
    expect(normalizarTelefone("(86) 99999-1234")).toBe("+5586999991234");
    expect(normalizarTelefone("+55 86 3222-1234")).toBe("+558632221234");
    expect(normalizarTelefone("123")).toBeNull();
    expect(normalizarTelefone(null)).toBeNull();
  });
});

describe("cadastro no Renave", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const pessoa = { nome: "Maria", documento: "123.456.789-09", email: "", cep: "64000-000", logradouro: "Rua A", numero: "1", complemento: "", bairro: "Centro", municipio: "Teresina", uf: "PI", codigo_municipio: "2211001" };
  const veiculo = { marca: "Fiat", modelo: "Uno", ano_fabricacao: 2015, ano_modelo: 2015, cor: "Branco", chassi: "9BD11111111111111", placa: "ABC1D23", renavam: "12345678901", km: 1, ncm: "87032100" };
  const roda = async (respostas: number[], dados = { pessoa, veiculo }) => {
    const chamadas: string[] = [];
    const fila = [...respostas];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { method: string }) => {
      chamadas.push(`${init.method} ${url.replace("https://r.test/v2", "")}`);
      const status = fila.shift() ?? 200;
      return new Response("x", { status });
    }));
    vi.stubEnv("RENAVE_FACIL_URL", "https://r.test/v2");
    vi.stubEnv("RENAVE_FACIL_TOKEN", "t");
    const r = await enviarAoRenave({ cnpj: "12.345.678/0001-90", op: "sales", chave: "k", valorCents: 100, ...dados });
    return { r, chamadas };
  };
  it("409 vira PUT (cliente e veículo)", async () => {
    const { r, chamadas } = await roda([409, 200, 409, 200, 200]);
    expect(r.tipo).toBe("ok");
    expect(chamadas).toEqual([
      "POST /dms/12345678000190/client", "PUT /dms/12345678000190/client/12345678909",
      "POST /dms/12345678000190/vehicle", "PUT /dms/12345678000190/vehicle/9BD11111111111111/U",
      "POST /dms/12345678000190/vehicle/nfe/sales",
    ]);
  });
  it("404 na NF-e recadastra o veículo e tenta de novo", async () => {
    const { r, chamadas } = await roda([201, 201, 404, 201, 201, 200]);
    expect(r.tipo).toBe("ok");
    expect(chamadas.filter((c) => c.endsWith("/nfe/sales"))).toHaveLength(2);
  });
  it("dado faltando rejeita sem chamar a API", async () => {
    const { r, chamadas } = await roda([], { pessoa, veiculo: { ...veiculo, renavam: "" } });
    expect(r).toEqual({ tipo: "rejeitado", erro: "dados_incompletos: renavam" });
    expect(chamadas).toHaveLength(0);
  });
});

describe("indicador de IE do destinatário", () => {
  it("CPF e CNPJ sem IE = 9; CNPJ com IE = 1", () => {
    expect(destinatarioIe({ documento: "123.456.789-09" })).toEqual({ indicadorIe: 9, inscricaoEstadual: null });
    expect(destinatarioIe({ documento: "12345678000190", inscricao_estadual: "" })).toEqual({ indicadorIe: 9, inscricaoEstadual: null });
    expect(destinatarioIe({ documento: "12.345.678/0001-90", inscricao_estadual: "12.345-6" })).toEqual({ indicadorIe: 1, inscricaoEstadual: "123456" });
    expect(destinatarioIe({ documento: "123.456.789-09", inscricao_estadual: "123" }).indicadorIe).toBe(9);
  });
});

describe("PIS/COFINS do item", () => {
  const item = { codigo: "A", descricao: "X", ncm: "87032100", cfop: "5102", origem: 0, situacaoIcms: "102", aliquotaIcms: null, reducaoBcPct: null, quantidade: 1, valorUnitarioCents: 100, informacoesAdicionais: "", ibsCbs: null };
  it("usa o CST da regra e cai em 07 se ausente", () => {
    expect(itemParaFocus({ ...item, cstPis: "49", cstCofins: "08" }, 1)).toMatchObject({ pis_situacao_tributaria: "49", cofins_situacao_tributaria: "08" });
    expect(itemParaFocus(item, 1)).toMatchObject({ pis_situacao_tributaria: "07", cofins_situacao_tributaria: "07" });
  });
});
