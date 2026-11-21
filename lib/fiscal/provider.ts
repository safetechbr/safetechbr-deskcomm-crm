/**
 * Contrato do provedor fiscal. O resto do sistema só conhece esta interface;
 * trocar o Focus NFe por outro provedor = escrever outro adaptador.
 * Nada aqui fala com a SEFAZ diretamente.
 */

export type Ambiente = "homologacao" | "producao";

export type StatusDocumento =
  | "rascunho"
  | "processando"
  | "autorizada"
  | "rejeitada"
  | "denegada"
  | "cancelada"
  | "inutilizada";

/** Credenciais/identidade da loja no provedor. O token vem decifrado só em memória. */
export interface ContextoProvider {
  cnpj: string;
  ambiente: Ambiente;
  token: string;
}

export interface DadosEmpresa {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  inscricaoEstadual: string | null;
  inscricaoMunicipal: string | null;
  crt: number;
  cnae: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string;
  cep: string | null;
  telefone: string | null;
  email: string | null;
}

/** .pfx e senha só existem em memória: vão direto ao provedor e não são gravados. */
export interface Certificado {
  pfxBase64: string;
  senha: string;
}

export interface ResultadoEmpresa {
  empresaId: string | null;
  /** Token que as chamadas seguintes usam; o chamador cifra antes de gravar. */
  token: string | null;
}

export interface PessoaDestino {
  nome: string;
  /** Só dígitos: 11 (CPF) ou 14 (CNPJ). */
  documento: string;
  /** 1=contribuinte, 2=isento, 9=não contribuinte. */
  indicadorIe: 1 | 2 | 9;
  inscricaoEstadual: string | null;
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  codigoMunicipio: string | null;
  uf: string;
  cep: string;
}

export interface ItemNfe {
  codigo: string;
  descricao: string;
  /** 8 dígitos. */
  ncm: string;
  cfop: string;
  /** Origem da mercadoria (0 = nacional). */
  origem: number;
  /** CSOSN (Simples) ou CST (Normal). */
  situacaoIcms: string;
  aliquotaIcms: number | null;
  reducaoBcPct: number | null;
  /** CST de PIS/COFINS da regra fiscal; ausente = "07". */
  cstPis?: string;
  cstCofins?: string;
  quantidade: number;
  valorUnitarioCents: number;
  /** infAdProd (até 500 caracteres). */
  informacoesAdicionais: string;
  /** IBS/CBS: podem ficar vazios; o Simples passa a precisar a partir de jan/2027. */
  ibsCbs: { cst: string; cClassTrib: string } | null;
}

export interface DocumentoParaEmitir {
  /** Referência única do documento no provedor (id do documento). */
  ref: string;
  ambiente: Ambiente;
  /** 0=entrada, 1=saída. */
  tipo: 0 | 1;
  /** 1=interna, 2=interestadual, 3=exterior. */
  localDestino: 1 | 2 | 3;
  /** 1=normal, 2=complementar, 3=ajuste, 4=devolução. */
  finalidade: 1 | 2 | 3 | 4;
  consumidorFinal: boolean;
  /** 1=presencial, 2=internet... (campo presenca_comprador). */
  presencaComprador: number;
  naturezaOperacao: string;
  dataEmissao: string;
  serie: number;
  numero: number;
  emitente: DadosEmpresa;
  destinatario: PessoaDestino;
  itens: ItemNfe[];
  informacoesAdicionais: string | null;
  formaPagamento: string;
}

export interface RejeicaoFiscal {
  /** Código da SEFAZ ou do provedor, como veio. */
  codigo: string | null;
  /** Mensagem original, como veio. */
  mensagem: string;
  /** Mensagem em português claro para o lojista. */
  explicacao: string;
}

export interface ResultadoDocumento {
  status: StatusDocumento;
  numero: number | null;
  serie: number | null;
  chave: string | null;
  protocolo: string | null;
  xmlUrl: string | null;
  pdfUrl: string | null;
  /** XML do evento de cancelamento (só existe em nota cancelada). */
  xmlCancelamentoUrl?: string | null;
  rejeicao: RejeicaoFiscal | null;
  /** Resposta crua do provedor (sem segredos), para auditoria. */
  bruto: unknown;
}

export interface ResultadoEvento {
  ok: boolean;
  protocolo: string | null;
  rejeicao: RejeicaoFiscal | null;
  bruto: unknown;
}

export interface FiscalProvider {
  cadastrarEmpresa(dados: DadosEmpresa, certificado: Certificado | null): Promise<ResultadoEmpresa>;
  emitirNfe(ctx: ContextoProvider, doc: DocumentoParaEmitir): Promise<ResultadoDocumento>;
  consultarNfe(ctx: ContextoProvider, ref: string): Promise<ResultadoDocumento>;
  cancelarNfe(ctx: ContextoProvider, ref: string, justificativa: string): Promise<ResultadoEvento>;
  cartaCorrecao(ctx: ContextoProvider, ref: string, texto: string): Promise<ResultadoEvento>;
  inutilizar(
    ctx: ContextoProvider,
    serie: number,
    numeroInicial: number,
    numeroFinal: number,
    justificativa: string,
  ): Promise<ResultadoEvento>;
  baixarXml(ctx: ContextoProvider, ref: string): Promise<Uint8Array>;
  baixarDanfe(ctx: ContextoProvider, ref: string): Promise<Uint8Array>;
}
