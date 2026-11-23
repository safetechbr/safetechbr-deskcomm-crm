/** Adaptador Focus NFe v2 do contrato FiscalProvider. Token, .pfx e senha nunca são logados. */
import type {
  Certificado,
  ContextoProvider,
  DadosEmpresa,
  DocumentoParaEmitir,
  FiscalProvider,
  RejeicaoFiscal,
  ResultadoDocumento,
  ResultadoEmpresa,
  ResultadoEvento,
} from "../provider";
import { baixarArquivo, chamarFocus, FOCUS_URL, type FetchLike, type RespostaFocus } from "./client";
import { payloadNfe, rejeicaoDe, rejeicaoDeRequisicao, resultadoDeConsulta } from "./mapear";

const ok2xx = (http: number) => http >= 200 && http < 300;
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const soDigitos = (s: string) => s.replace(/\D/g, "");

function validarTexto(rotulo: string, t: string, min: number, max: number) {
  const n = t.trim().length;
  if (n < min || n > max) throw new Error(`${rotulo} deve ter entre ${min} e ${max} caracteres.`);
}

function resultadoDeEvento(r: RespostaFocus, statusOk: string): ResultadoEvento {
  const ok = ok2xx(r.http) && r.json.status === statusOk;
  return {
    ok,
    protocolo: texto(r.json.numero_protocolo ?? r.json.protocolo),
    rejeicao: ok
      ? null
      : r.json.status_sefaz
        ? rejeicaoDe(texto(r.json.status_sefaz), texto(r.json.mensagem_sefaz) ?? "Sem mensagem da SEFAZ.")
        : rejeicaoDeRequisicao(r.json),
    bruto: r.json,
  };
}

/** A Focus não conhece esta ref (404): a emissão nunca chegou lá. */
export class NotaNaoEncontradaNoProvedor extends Error {}

export interface OpcoesFocus {
  fetchImpl?: FetchLike;
  /** Token de revenda: só o cadastro de empresas usa. */
  tokenRevenda?: string;
}

export class FocusNfeProvider implements FiscalProvider {
  private readonly f: FetchLike;
  private readonly tokenRevenda: string | undefined;

  constructor(o: OpcoesFocus = {}) {
    this.f = o.fetchImpl ?? ((i, init) => fetch(i, init));
    this.tokenRevenda = o.tokenRevenda;
  }

  private chamar(ctx: ContextoProvider, m: "GET" | "POST" | "DELETE", caminho: string, corpo?: unknown) {
    return chamarFocus(this.f, FOCUS_URL[ctx.ambiente], ctx.token, m, caminho, corpo);
  }

  async cadastrarEmpresa(d: DadosEmpresa, cert: Certificado | null): Promise<ResultadoEmpresa> {
    if (!this.tokenRevenda) throw new Error("Token de revenda da Focus NFe não configurado.");
    const corpo: Record<string, unknown> = {
      cnpj: soDigitos(d.cnpj),
      razao_social: d.razaoSocial,
      nome_fantasia: d.nomeFantasia,
      inscricao_estadual: d.inscricaoEstadual,
      inscricao_municipal: d.inscricaoMunicipal,
      regime_tributario: d.crt,
      cnae_code: d.cnae,
      logradouro: d.logradouro,
      numero: d.numero,
      complemento: d.complemento,
      bairro: d.bairro,
      municipio: d.municipio,
      uf: d.uf,
      cep: d.cep,
      telefone: d.telefone,
      email: d.email,
      habilita_nfe: true,
    };
    if (cert) {
      corpo.arquivo_certificado_base64 = cert.pfxBase64;
      // unconfirmed: nome do campo da senha na API de empresas da Focus.
      corpo.senha_certificado = cert.senha;
    }
    const r = await chamarFocus(this.f, FOCUS_URL.producao, this.tokenRevenda, "POST", "/v2/empresas", corpo);
    if (!ok2xx(r.http)) {
      throw new Error(rejeicaoDeRequisicao(r.json).mensagem);
    }
    return {
      empresaId: texto(r.json.id) ?? (r.json.id != null ? String(r.json.id) : null),
      // unconfirmed: a Focus devolve token por empresa com estes nomes.
      token: texto(r.json.token_producao) ?? texto(r.json.token_homologacao),
    };
  }

  async emitirNfe(ctx: ContextoProvider, doc: DocumentoParaEmitir): Promise<ResultadoDocumento> {
    const r = await this.chamar(ctx, "POST", `/v2/nfe?ref=${encodeURIComponent(doc.ref)}`, payloadNfe(doc));
    if (ok2xx(r.http)) {
      return {
        status: "processando",
        numero: doc.numero,
        serie: doc.serie,
        chave: texto(r.json.chave_nfe),
        protocolo: null,
        xmlUrl: null,
        pdfUrl: null,
        rejeicao: null,
        bruto: r.json,
      };
    }
    return {
      status: "rejeitada",
      numero: doc.numero,
      serie: doc.serie,
      chave: null,
      protocolo: null,
      xmlUrl: null,
      pdfUrl: null,
      rejeicao: rejeicaoDeRequisicao(r.json),
      bruto: r.json,
    };
  }

  async consultarNfe(ctx: ContextoProvider, ref: string): Promise<ResultadoDocumento> {
    const r = await this.chamar(ctx, "GET", `/v2/nfe/${encodeURIComponent(ref)}?completa=1`);
    if (r.http === 404) throw new NotaNaoEncontradaNoProvedor(rejeicaoDeRequisicao(r.json).mensagem);
    if (!ok2xx(r.http)) throw new Error(rejeicaoDeRequisicao(r.json).mensagem);
    return resultadoDeConsulta(r.json);
  }

  async cancelarNfe(ctx: ContextoProvider, ref: string, justificativa: string): Promise<ResultadoEvento> {
    validarTexto("A justificativa", justificativa, 15, 255);
    const r = await this.chamar(ctx, "DELETE", `/v2/nfe/${encodeURIComponent(ref)}`, {
      justificativa: justificativa.trim(),
    });
    return resultadoDeEvento(r, "cancelado");
  }

  async cartaCorrecao(ctx: ContextoProvider, ref: string, textoCorrecao: string): Promise<ResultadoEvento> {
    validarTexto("A correção", textoCorrecao, 15, 1000);
    const r = await this.chamar(ctx, "POST", `/v2/nfe/${encodeURIComponent(ref)}/carta_correcao`, {
      correcao: textoCorrecao.trim(),
    });
    return resultadoDeEvento(r, "autorizado");
  }

  async inutilizar(
    ctx: ContextoProvider,
    serie: number,
    numeroInicial: number,
    numeroFinal: number,
    justificativa: string,
  ): Promise<ResultadoEvento> {
    validarTexto("A justificativa", justificativa, 15, 255);
    if (numeroFinal < numeroInicial) throw new Error("O número final deve ser maior ou igual ao inicial.");
    const r = await this.chamar(ctx, "POST", "/v2/nfe/inutilizacao", {
      cnpj: soDigitos(ctx.cnpj),
      serie: String(serie),
      numero_inicial: numeroInicial,
      numero_final: numeroFinal,
      justificativa: justificativa.trim(),
    });
    return resultadoDeEvento(r, "autorizado");
  }

  private async arquivo(ctx: ContextoProvider, ref: string, campo: "xmlUrl" | "pdfUrl" | "xmlCancelamentoUrl", rotulo: string) {
    const c = await this.consultarNfe(ctx, ref);
    const caminho = c[campo];
    if (!caminho) throw new Error(`${rotulo} ainda não disponível para esta nota.`);
    return baixarArquivo(this.f, FOCUS_URL[ctx.ambiente], ctx.token, caminho);
  }

  baixarXml(ctx: ContextoProvider, ref: string): Promise<Uint8Array> {
    return this.arquivo(ctx, ref, "xmlUrl", "O XML");
  }

  baixarXmlCancelamento(ctx: ContextoProvider, ref: string): Promise<Uint8Array> {
    return this.arquivo(ctx, ref, "xmlCancelamentoUrl", "O XML do cancelamento");
  }

  baixarDanfe(ctx: ContextoProvider, ref: string): Promise<Uint8Array> {
    return this.arquivo(ctx, ref, "pdfUrl", "O DANFE");
  }
}

export type { RejeicaoFiscal };
