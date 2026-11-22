/** Contrato agnóstico de integradora RENAVE. Nada aqui conhece a Renave Fácil. */

export type CodigoErroRenave =
  | "renave_nao_vinculado" // 403
  | "renave_nao_cadastrado" // 404
  | "renave_ja_cadastrado" // 409
  | "renave_validacao" // 400
  | "renave_limite" // 429
  | "renave_indisponivel" // 5xx, timeout, rede
  | "renave_auth"; // 401

export class RenaveErro extends Error {
  constructor(
    public readonly codigo: CodigoErroRenave,
    public readonly status: number | null,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "RenaveErro";
  }
}

export type SituacaoRenave = "S" | "T" | "C" | "X" | "V" | "E" | "I" | "";
export type TipoVeiculo = "N" | "U";

export interface ClienteRenave {
  /** CPF ou CNPJ, só dígitos. */
  id: string;
  razaoSocial: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  email?: string | null;
}

export interface VeiculoRenave {
  chassi: string;
  tipoVeiculo: TipoVeiculo;
  descricao: string;
  anoFabricacao: number;
  anoModelo: number;
  placa: string;
  renavam: string;
  codigoFipe?: string | null;
}

export interface NfeRenave {
  chassi: string;
  tipoVeiculo: TipoVeiculo;
  chaveNfe: string;
  /** Vendedor (compra) ou comprador (venda). Só dígitos. */
  cpfCnpj: string;
  /** `YYYY-MM-DDTHH:MM:SS`, horário local da loja, sem Z. */
  dtHrProcesso: string;
  valor: number;
}

export interface TransferenciaRenave {
  chassi: string;
  tipoVeiculo: TipoVeiculo;
  chaveNfe: string;
}

export interface EstabelecimentoRenave {
  cadastrado: boolean;
  confirmado: boolean;
  vinculado: boolean;
}

export interface DocumentosDisponiveis {
  termoEntrada: boolean;
  atpvEntrada: boolean;
  crlv: boolean;
  termoSaida: boolean;
  atpvSaida: boolean;
}

export interface StatusRenave {
  chassi: string;
  placa: string;
  renavam: string;
  descricao: string;
  estoqueRenave: boolean;
  situacao: SituacaoRenave;
  documentos: DocumentosDisponiveis;
}

export type TipoDocumentoRenave = "termo_entrada" | "atpve_entrada" | "crlve" | "termo_saida" | "atpve_saida";

export interface DocumentoBaixado {
  /** Um PDF por arquivo; o CRLV-e traz o PDF do código de segurança junto. */
  pdfs: { nome: string; base64: string }[];
}

export interface CreditosRenave {
  cnpj: string;
  seminovos: number;
  zeroKm: number;
}

export interface ChaveVeiculo {
  placa: string;
  renavam: string;
}

export interface IntegradoraRenave {
  readonly id: string;
  verificarEstabelecimento(cnpj: string): Promise<EstabelecimentoRenave>;
  enviarCliente(cnpj: string, cliente: ClienteRenave): Promise<void>;
  enviarVeiculo(cnpj: string, veiculo: VeiculoRenave): Promise<void>;
  enviarNfeCompra(cnpj: string, nfe: NfeRenave): Promise<void>;
  enviarNfeVenda(cnpj: string, nfe: NfeRenave): Promise<void>;
  enviarNfeTransferencia(cnpj: string, nfe: TransferenciaRenave): Promise<void>;
  consultarStatus(cnpj: string, chave: ChaveVeiculo): Promise<StatusRenave>;
  baixarDocumento(cnpj: string, chave: ChaveVeiculo, tipo: TipoDocumentoRenave): Promise<DocumentoBaixado | null>;
  consultarCreditos(cnpj: string): Promise<CreditosRenave>;
}

/** Uma chamada HTTP, sem corpo e sem dado pessoal: o endpoint vai em modelo (`:cnpj`). */
export interface RegistroChamada {
  endpoint: string;
  metodo: string;
  status: number | null;
  ms: number;
  erro?: string;
}
export type RegistrarChamada = (r: RegistroChamada) => void | Promise<void>;
