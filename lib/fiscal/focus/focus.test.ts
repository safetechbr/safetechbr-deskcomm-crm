import { describe, expect, it, vi } from "vitest";
import type { ContextoProvider, DocumentoParaEmitir } from "../provider";
import { FocusNfeProvider, NotaNaoEncontradaNoProvedor } from "./provider";

const TOKEN = "tok_segredo_123";
const ctx: ContextoProvider = { cnpj: "12.345.678/0001-99", ambiente: "homologacao", token: TOKEN };

const resp = (json: unknown, status = 200) => new Response(JSON.stringify(json), { status });

function setup(...respostas: Response[]) {
  const f = vi.fn();
  for (const r of respostas) f.mockResolvedValueOnce(r);
  return { f, p: new FocusNfeProvider({ fetchImpl: f, tokenRevenda: "rev_tok" }) };
}

const doc = {
  ref: "nota 1",
  numero: "10",
  serie: "1",
  naturezaOperacao: "Venda",
  dataEmissao: "2026-11-20T10:00:00-03:00",
  tipo: 1,
  localDestino: 1,
  finalidade: 1,
  consumidorFinal: true,
  presencaComprador: 1,
  formaPagamento: "01",
  informacoesAdicionais: null,
  emitente: {
    cnpj: "12345678000199",
    razaoSocial: "Loja",
    nomeFantasia: "Loja",
    inscricaoEstadual: "194000000",
    crt: 1,
    logradouro: "Rua",
    numero: "1",
    bairro: "Centro",
    municipio: "Teresina",
    uf: "PI",
    cep: "64000000",
  },
  destinatario: {
    nome: "Fulano",
    documento: "123.456.789-09",
    indicadorIe: 9,
    inscricaoEstadual: null,
    logradouro: "Rua",
    numero: "2",
    bairro: "Centro",
    municipio: "Teresina",
    uf: "PI",
    cep: "64000000",
  },
  itens: [],
} as unknown as DocumentoParaEmitir;

describe("FocusNfeProvider", () => {
  it("emite: POST com ref na URL e Basic auth; 2xx vira processando", async () => {
    const { f, p } = setup(resp({ chave_nfe: "NFe123" }, 201));
    const r = await p.emitirNfe(ctx, doc);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://homologacao.focusnfe.com.br/v2/nfe?ref=nota%201");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`${TOKEN}:`).toString("base64")}`);
    expect(r.status).toBe("processando");
    expect(r.chave).toBe("NFe123");
  });

  it("emite: 4xx vira rejeitada com explicação", async () => {
    const { p } = setup(resp({ codigo: "778", mensagem: "NCM inválido" }, 422));
    const r = await p.emitirNfe(ctx, doc);
    expect(r.status).toBe("rejeitada");
    expect(r.rejeicao?.codigo).toBe("778");
    expect(r.rejeicao?.explicacao).toMatch(/NCM/);
  });

  it("emite uma troca sem pagamento com valor pago zero e preserva o valor fiscal", async () => {
    const { f, p } = setup(resp({}, 201));
    await p.emitirNfe(ctx, {
      ...doc,
      tipo: 0,
      formaPagamento: "90",
      destinatario: { ...doc.destinatario, codigoMunicipio: "2211001", complemento: "Apto. 2" },
      itens: [{ quantidade: 1, valorUnitarioCents: 2_000_000 } as DocumentoParaEmitir["itens"][number]],
    });
    const payload = JSON.parse(f.mock.calls[0]![1].body);
    expect(payload).toMatchObject({
      valor_total: 20_000,
      codigo_municipio_destinatario: "2211001",
      complemento_destinatario: "Apto. 2",
      formas_pagamento: [{ forma_pagamento: "90", valor_pagamento: 0 }],
    });
  });

  it("consulta: mapeia autorizado e rejeitado", async () => {
    const { p } = setup(
      resp({ status: "autorizado", numero: "10", caminho_xml_nota_fiscal: "/x.xml", caminho_danfe: "/d.pdf" }),
      resp({ status: "erro_autorizacao", status_sefaz: "233", mensagem_sefaz: "IE inválida" }),
    );
    const a = await p.consultarNfe(ctx, "r1");
    expect(a.status).toBe("autorizada");
    expect(a.xmlUrl).toBe("/x.xml");
    const b = await p.consultarNfe(ctx, "r2");
    expect(b.status).toBe("rejeitada");
    expect(b.rejeicao?.codigo).toBe("233");
  });

  it("erro lançado não vaza o token", async () => {
    const { p } = setup(resp({ mensagem: "não autorizado" }, 401));
    const e = await p.consultarNfe(ctx, "r1").catch((x: Error) => x);
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).not.toContain(TOKEN);
  });

  it("consulta: 404 lança NotaNaoEncontradaNoProvedor", async () => {
    const { p } = setup(resp({ mensagem: "Nota fiscal não encontrada" }, 404));
    await expect(p.consultarNfe(ctx, "r1")).rejects.toBeInstanceOf(NotaNaoEncontradaNoProvedor);
  });

  it("cancelar: valida justificativa e devolve ok", async () => {
    const { f, p } = setup(resp({ status: "cancelado", numero_protocolo: "P1" }));
    await expect(p.cancelarNfe(ctx, "r1", "curta")).rejects.toThrow(/entre 15 e 255/);
    expect(f).not.toHaveBeenCalled();
    const r = await p.cancelarNfe(ctx, "r1", "Erro de digitação no valor");
    expect(f.mock.calls[0]![1].method).toBe("DELETE");
    expect(r.ok).toBe(true);
    expect(r.protocolo).toBe("P1");
  });

  it("cancelar recusado traz rejeição da SEFAZ", async () => {
    const { p } = setup(resp({ status: "erro_cancelamento", status_sefaz: "501", mensagem_sefaz: "Prazo excedido" }, 200));
    const r = await p.cancelarNfe(ctx, "r1", "Erro de digitação no valor");
    expect(r.ok).toBe(false);
    expect(r.rejeicao?.mensagem).toBe("Prazo excedido");
  });

  it("CC-e valida tamanho e envia correcao", async () => {
    const { f, p } = setup(resp({ status: "autorizado", numero_protocolo: "P2" }));
    await expect(p.cartaCorrecao(ctx, "r1", "x")).rejects.toThrow(/entre 15 e 1000/);
    const r = await p.cartaCorrecao(ctx, "r1", "Corrigir a placa do veículo");
    expect(f.mock.calls[0]![0]).toContain("/v2/nfe/r1/carta_correcao");
    expect(JSON.parse(f.mock.calls[0]![1].body)).toEqual({ correcao: "Corrigir a placa do veículo" });
    expect(r.ok).toBe(true);
  });

  it("inutilizar valida faixa e envia serie como string", async () => {
    const { f, p } = setup(resp({ status: "autorizado" }));
    await expect(p.inutilizar(ctx, 1, 5, 3, "Numeração pulada por erro")).rejects.toThrow(/final/);
    await p.inutilizar(ctx, 1, 3, 5, "Numeração pulada por erro");
    const corpo = JSON.parse(f.mock.calls[0]![1].body);
    expect(corpo).toMatchObject({ cnpj: "12345678000199", serie: "1", numero_inicial: 3, numero_final: 5 });
  });

  it("baixarXml consulta e depois baixa; sem URL lança", async () => {
    const { f, p } = setup(
      resp({ status: "autorizado", caminho_xml_nota_fiscal: "/arq/n.xml" }),
      new Response("<xml/>", { status: 200 }),
      resp({ status: "processando_autorizacao" }),
    );
    const bytes = await p.baixarXml(ctx, "r1");
    expect(new TextDecoder().decode(bytes)).toBe("<xml/>");
    expect(f.mock.calls[1]![0]).toBe("https://homologacao.focusnfe.com.br/arq/n.xml");
    await expect(p.baixarDanfe(ctx, "r2")).rejects.toThrow(/ainda não disponível/);
  });

  it("cadastrarEmpresa: exige token de revenda e envia certificado", async () => {
    const sem = new FocusNfeProvider({ fetchImpl: vi.fn() });
    const dados = { cnpj: "12.345.678/0001-99", razaoSocial: "Loja" } as never;
    await expect(sem.cadastrarEmpresa(dados, null)).rejects.toThrow(/revenda/);

    const { f, p } = setup(resp({ id: 7, token_producao: "novo" }, 201));
    const r = await p.cadastrarEmpresa(dados, { pfxBase64: "QUJD", senha: "s3nha" });
    const corpo = JSON.parse(f.mock.calls[0]![1].body);
    expect(f.mock.calls[0]![0]).toBe("https://api.focusnfe.com.br/v2/empresas");
    expect(corpo.cnpj).toBe("12345678000199");
    expect(corpo.arquivo_certificado_base64).toBe("QUJD");
    expect(r).toEqual({ empresaId: "7", token: "novo" });
  });
});
