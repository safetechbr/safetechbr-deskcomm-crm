/**
 * Conteúdo do campo `rascunho` de um documento fiscal e as validações de antes de emitir.
 * Funções puras: nada aqui toca banco ou rede.
 */
import { documentoValido, soDigitos } from "@/lib/pdv/regras";
import type { OperacaoFiscal } from "./regras";

export interface PessoaFiscal {
  nome: string;
  documento: string;
  email: string | null;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  municipio: string;
  uf: string;
  /** IBGE do município: vem do CEP; se não vier, o lojista informa na nota. */
  codigo_municipio: string | null;
  /** Só para CNPJ contribuinte do ICMS; vazio/ISENTO = não contribuinte. */
  inscricao_estadual?: string | null;
}

/** Indicador de IE do destinatário: 1 contribuinte (CNPJ com IE), 9 não contribuinte (CPF ou CNPJ sem IE). */
export function destinatarioIe(p: Pick<PessoaFiscal, "documento" | "inscricao_estadual">): { indicadorIe: 1 | 9; inscricaoEstadual: string | null } {
  const ie = (p.inscricao_estadual ?? "").replace(/\D/g, "");
  if (p.documento.replace(/\D/g, "").length === 14 && ie) return { indicadorIe: 1, inscricaoEstadual: ie };
  return { indicadorIe: 9, inscricaoEstadual: null };
}

export interface VeiculoFiscal {
  marca: string | null;
  modelo: string | null;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  cor: string | null;
  chassi: string | null;
  placa: string | null;
  renavam: string | null;
  km: number | null;
  ncm: string | null;
}

export interface RascunhoFiscal {
  pessoa: PessoaFiscal;
  veiculo: VeiculoFiscal;
  /** Só na venda com troca: placa do carro recebido, para a observação da nota. */
  troca_placa?: string | null;
  /** Compra de PJ com XML importado (Fase 2): dispensa a NF-e de entrada própria. */
  origem?: "compra_pf" | "troca" | "compra_pj" | null;
}

/** Texto que a SEFAZ aceita no infCpl: a observação da troca na nota de venda. */
export function observacaoDaTroca(placa: string, numeroEntrada: number): string {
  return `Veículo ${placa.toUpperCase()} recebido como parte do pagamento – NF-e de entrada nº ${numeroEntrada}`;
}

const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

export function validarPessoa(p: PessoaFiscal): string[] {
  const e: string[] = [];
  if (!p.nome.trim()) e.push("Pessoa: informe o nome.");
  if (!documentoValido(p.documento)) e.push("Pessoa: CPF/CNPJ inválido.");
  if (soDigitos(p.cep).length !== 8) e.push("Pessoa: CEP deve ter 8 dígitos.");
  if (!p.logradouro.trim()) e.push("Pessoa: informe a rua.");
  if (!p.numero.trim()) e.push("Pessoa: informe o número do endereço (use S/N se não houver).");
  if (!p.bairro.trim()) e.push("Pessoa: informe o bairro.");
  if (!p.municipio.trim()) e.push("Pessoa: informe a cidade.");
  if (!UFS.has(p.uf.trim().toUpperCase())) e.push("Pessoa: UF inválida.");
  if (!p.codigo_municipio || !/^\d{7}$/.test(p.codigo_municipio))
    e.push("Pessoa: código IBGE do município não encontrado pelo CEP. Informe os 7 dígitos.");
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) e.push("Pessoa: e-mail inválido.");
  return e;
}

export function validarVeiculo(v: VeiculoFiscal): string[] {
  const e: string[] = [];
  if (!v.chassi || !/^[A-HJ-NPR-Z0-9]{17}$/i.test(v.chassi.trim()))
    e.push("Veículo: chassi deve ter 17 caracteres (sem I, O ou Q).");
  if (!v.placa?.trim()) e.push("Veículo: informe a placa.");
  if (!v.renavam || soDigitos(v.renavam).length < 9) e.push("Veículo: informe o Renavam.");
  if (!v.ncm || !/^\d{8}$/.test(v.ncm)) e.push("Veículo: NCM deve ter 8 dígitos.");
  if (!v.ano_fabricacao) e.push("Veículo: informe o ano de fabricação.");
  if (!v.ano_modelo) e.push("Veículo: informe o ano do modelo.");
  if (!v.cor?.trim()) e.push("Veículo: informe a cor.");
  if (v.km == null) e.push("Veículo: informe a quilometragem.");
  if (!v.marca?.trim() && !v.modelo?.trim()) e.push("Veículo: informe marca e modelo.");
  return e;
}

export interface ContextoDeValidacao {
  operacao: OperacaoFiscal;
  rascunho: RascunhoFiscal;
  valorTotalCents: number;
  /** Venda: NF-e de entrada do chassi (veiculos.nfe_entrada_id) e se está autorizada. */
  entradaAutorizada: boolean;
  /** Venda com troca: NF-e de entrada da troca existe e está autorizada, com número. */
  trocaEntradaNumero: number | null;
  temRegraAtiva: boolean;
}

/** Tudo que bloqueia a emissão, em português claro. Vazio = pode emitir. */
export function validarParaEmitir(c: ContextoDeValidacao): string[] {
  const e = [...validarPessoa(c.rascunho.pessoa), ...validarVeiculo(c.rascunho.veiculo)];
  if (c.valorTotalCents <= 0) e.push("Valor da nota deve ser maior que zero.");
  if (!c.temRegraAtiva)
    e.push("Não há regra fiscal ativa para esta operação, destino e tipo de pessoa. Fale com o contador.");
  if (c.operacao === "SAI_VENDA") {
    // Exceção: compra de PJ com XML importado (importação é Fase 2; o campo já existe).
    if (c.rascunho.origem !== "compra_pj" && !c.entradaAutorizada)
      e.push("Este chassi não tem NF-e de entrada autorizada. Emita e autorize a nota de entrada antes da venda.");
    if (c.rascunho.troca_placa && c.trocaEntradaNumero == null)
      e.push("A NF-e de entrada da troca ainda não foi autorizada. Autorize-a antes de emitir a venda.");
  }
  if (c.operacao !== "SAI_VENDA" && soDigitos(c.rascunho.pessoa.documento).length === 14)
    e.push("Compra de pessoa jurídica não é emitida aqui (NF-e de entrada só para pessoa física).");
  return e;
}
