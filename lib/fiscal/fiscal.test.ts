import { describe, expect, it } from "vitest";
import { alertaDeCertificado } from "./certificado-alertas";
import { montarChecklist, podeEmitir, podeEmitirNotaTeste, type ConfigParaChecklist } from "./checklist";
import { infAdProdVeiculo } from "./inf-adic-veiculo";
import { ncmPadraoDaCategoria } from "./ncm";
import { bloqueioDeProducao, escolherRegra, type RegraFiscal } from "./regras";

const regra = (o: Partial<RegraFiscal>): RegraFiscal => ({
  operacao: "SAI_VENDA",
  destino: "interna",
  tipo_pessoa: "PF",
  presencial: true,
  cfop: "5102",
  natureza_operacao: "Venda",
  csosn_ou_cst: "102",
  aliq_icms: null,
  reducao_bc_pct: null,
  cst_ibscbs: null,
  cclasstrib: null,
  texto_inf_adic: null,
  validado_contador: false,
  ativo: true,
  ...o,
});

describe("escolherRegra", () => {
  const regras = [
    regra({}),
    regra({ destino: "interestadual", presencial: true, cfop: "5102" }),
    regra({ destino: "interestadual", presencial: false, cfop: "6108" }),
    regra({ operacao: "ENT_COMPRA_PF", destino: "interestadual", cfop: "2102" }),
  ];
  const base = { operacao: "SAI_VENDA" as const, ufEmitente: "PI", ufContraparte: "PI", tipoPessoa: "PF" as const, presencial: true };

  it("venda interna usa 5102 e idDest 1", () => {
    const r = escolherRegra(regras, base);
    expect(r?.regra.cfop).toBe("5102");
    expect(r?.localDestino).toBe(1);
  });
  it("presencial a consumidor de outra UF vira idDest 1 (CFOP 5102)", () => {
    const r = escolherRegra(regras, { ...base, ufContraparte: "MA" });
    expect(r?.regra.cfop).toBe("5102");
    expect(r?.localDestino).toBe(1);
  });
  it("não presencial para não contribuinte de outra UF usa 6108 e idDest 2", () => {
    const r = escolherRegra(regras, { ...base, ufContraparte: "MA", presencial: false });
    expect(r?.regra.cfop).toBe("6108");
    expect(r?.localDestino).toBe(2);
  });
  it("entrada interestadual usa 2102", () => {
    const r = escolherRegra(regras, { ...base, operacao: "ENT_COMPRA_PF", ufContraparte: "CE" });
    expect(r?.regra.cfop).toBe("2102");
  });
  it("sem regra ativa devolve null", () => {
    expect(escolherRegra([regra({ ativo: false })], base)).toBeNull();
  });
});

describe("bloqueioDeProducao", () => {
  it("bloqueia CRT 3 não validado em produção", () => {
    expect(bloqueioDeProducao(3, "producao", regra({}))).toMatch(/contador/);
  });
  it("libera em homologação, no Simples ou quando validado", () => {
    expect(bloqueioDeProducao(3, "homologacao", regra({}))).toBeNull();
    expect(bloqueioDeProducao(1, "producao", regra({}))).toBeNull();
    expect(bloqueioDeProducao(3, "producao", regra({ validado_contador: true }))).toBeNull();
  });
});

describe("infAdProdVeiculo", () => {
  it("monta o texto padrão", () => {
    expect(
      infAdProdVeiculo({
        marca: "Fiat",
        modelo: "Argo",
        anoFabricacao: 2020,
        anoModelo: 2021,
        cor: "Branca",
        chassi: "9bd1234567890abcd",
        placa: "abc1d23",
        renavam: "123456789",
        km: 45000,
      }),
    ).toBe(
      "Veículo usado – FIAT ARGO – Ano 2020/2021 – Cor Branca – Chassi 9BD1234567890ABCD – Placa ABC1D23 – Renavam 123456789 – Km 45000",
    );
  });
  it("omite o que falta e respeita o limite de 500", () => {
    expect(infAdProdVeiculo({ marca: null, modelo: null, anoFabricacao: null, anoModelo: null, cor: null, chassi: null, placa: null, renavam: null, km: 0 })).toBe(
      "Veículo usado – Km 0",
    );
    expect(infAdProdVeiculo({ marca: "x".repeat(600), modelo: null, anoFabricacao: null, anoModelo: null, cor: null, chassi: null, placa: null, renavam: null, km: null }).length).toBe(500);
  });
});

describe("ncmPadraoDaCategoria", () => {
  it.each([
    ["Sedã", "87030000"],
    ["Picape", "87040000"],
    ["Utilitário", "87040000"],
    ["Moto", "87110000"],
    [null, "87030000"],
  ])("%s → %s", (cat, ncm) => expect(ncmPadraoDaCategoria(cat)).toBe(ncm));
});

describe("alertaDeCertificado", () => {
  const hoje = new Date("2026-11-20T12:00:00Z");
  it("sem alerta acima de 30 dias", () => expect(alertaDeCertificado("2027-01-30", hoje)).toBeNull());
  it.each([
    ["2026-12-20", 30],
    ["2026-12-05", 15],
    ["2026-11-25", 5],
    ["2026-11-20", 5],
    ["2026-11-19", 0],
  ])("%s → faixa %i", (v, faixa) => expect(alertaDeCertificado(v, hoje)?.faixa).toBe(faixa));
});

describe("checklist", () => {
  const ok: ConfigParaChecklist = {
    cnpj: "12345678000199",
    inscricao_estadual: "194000000",
    inscricao_municipal: "12345",
    crt: 1,
    cnae: "4511102",
    uf: "PI",
    credenciado_sefaz: true,
    certificado_validade: "2027-06-01",
    serie_nfe: 1,
    proximo_numero_nfe: 1,
    regras_revisadas_em: "2026-11-01T00:00:00Z",
    email_contador: "contador@exemplo.com.br",
    ambiente: "homologacao",
    nota_teste_ok_em: null,
  };
  const hoje = new Date("2026-11-20T12:00:00Z");

  it("sem nota de teste: libera só a nota de teste", () => {
    const it = montarChecklist(ok, hoje);
    expect(podeEmitirNotaTeste(it)).toBe(true);
    expect(podeEmitir(it)).toBe(false);
  });
  it("tudo ok libera emissão", () => {
    expect(podeEmitir(montarChecklist({ ...ok, nota_teste_ok_em: "2026-11-02T00:00:00Z" }, hoje))).toBe(true);
  });
  it("aponta pendências e bloqueia certificado vencido", () => {
    const it = montarChecklist({ ...ok, cnpj: null, certificado_validade: "2026-01-01", credenciado_sefaz: false }, hoje);
    expect(it[0]!.pendencias).toContain("CNPJ com 14 dígitos");
    expect(it[1]!.ok).toBe(false);
    expect(it[2]!.pendencias[0]).toMatch(/vencido/);
    expect(podeEmitirNotaTeste(it)).toBe(false);
  });
});
