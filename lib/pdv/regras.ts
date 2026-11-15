/**
 * PDV DA LOJA DE CARROS — o formato único de uma negociação.
 *
 * VENDA: a loja vende um veículo do estoque. O cliente paga com uma ou mais
 * formas (entrada em PIX, financiamento, cartão…) e pode dar um carro na troca;
 * a troca abate o total pelo valor avaliado MENOS o que ainda deve dela
 * (a quitação que a loja assume).
 *
 * COMPRA: a loja compra o veículo de um cliente. `valor_cents` é quanto a loja
 * paga; os pagamentos são como ela paga (PIX, transferência, quitação do
 * financiamento do cliente…).
 *
 * Cliente, veículo e troca são FOTOGRAFIAS: o contrato reimpresso amanhã tem
 * que sair igual ao de hoje, mesmo que o cadastro mude. O banco guarda os jsonb
 * (migration 9031); este arquivo é a única definição do formato deles.
 */
import { contratoSchema, regularizacaoSchema, type DadosDoContrato } from "./modelo-contrato";
import { z } from "zod";

export const TIPOS_DE_NEGOCIACAO = ["venda", "compra"] as const;
export type TipoDeNegociacao = (typeof TIPOS_DE_NEGOCIACAO)[number];

export const STATUS_DA_NEGOCIACAO = ["rascunho", "concluida", "cancelada"] as const;
export type StatusDaNegociacao = (typeof STATUS_DA_NEGOCIACAO)[number];

export const ROTULO_DO_STATUS_DA_NEGOCIACAO: Record<StatusDaNegociacao, string> = {
  rascunho: "Em aberto",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const FORMAS_DE_PAGAMENTO = [
  "pix",
  "dinheiro",
  "transferencia",
  "cartao_debito",
  "cartao_credito",
  "financiamento",
  "consorcio",
  "boleto",
  "cheque",
  "promissoria",
  "crediario",
  "quitacao",
] as const;
export type FormaDePagamento = (typeof FORMAS_DE_PAGAMENTO)[number];

export const ROTULO_DA_FORMA: Record<FormaDePagamento, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  transferencia: "Transferência / TED",
  cartao_debito: "Cartão de débito",
  cartao_credito: "Cartão de crédito",
  financiamento: "Financiamento bancário",
  consorcio: "Carta de consórcio",
  boleto: "Boleto",
  cheque: "Cheque",
  promissoria: "Parcelado na loja (promissória)",
  crediario: "Crediário",
  quitacao: "Quitação de financiamento",
};

/** Formas que se pagam em parcelas — a tela pede número e valor da parcela. */
export const FORMAS_PARCELADAS: readonly FormaDePagamento[] = [
  "cartao_credito",
  "financiamento",
  "consorcio",
  "boleto",
  "cheque",
  "promissoria",
  "crediario",
];
/** Formas que envolvem um banco/financeira — a tela pede o nome dele. */
export const FORMAS_COM_BANCO: readonly FormaDePagamento[] = [
  "financiamento",
  "consorcio",
  "quitacao",
];

/** Formas que fazem sentido em cada lado do balcão. */
export const FORMAS_POR_TIPO: Record<TipoDeNegociacao, readonly FormaDePagamento[]> = {
  venda: FORMAS_DE_PAGAMENTO.filter((f) => f !== "quitacao"),
  compra: ["pix", "transferencia", "dinheiro", "cheque", "quitacao"],
};

const texto = (max: number) => z.string().trim().max(max);
const textoOpcional = (max: number) => texto(max).optional().nullable();
const centavos = z.number().int().min(0).max(100_000_000_000);
const ano = z.number().int().min(1900).max(2100);
const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD.")
  .optional()
  .nullable();

/** Só os dígitos de CPF/CNPJ/CEP/telefone. */
export function soDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

function digitoVerificador(base: string, pesos: number[]): number {
  const soma = base.split("").reduce((acc, d, i) => acc + Number(d) * pesos[i]!, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** CPF (11) ou CNPJ (14) com dígitos verificadores corretos. */
export function documentoValido(valor: string | null | undefined): boolean {
  const d = soDigitos(valor);
  if (/^(\d)\1+$/.test(d)) return false;
  if (d.length === 11) {
    const p1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
    const p2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    return (
      digitoVerificador(d.slice(0, 9), p1) === Number(d[9]) &&
      digitoVerificador(d.slice(0, 10), p2) === Number(d[10])
    );
  }
  if (d.length === 14) {
    const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    return (
      digitoVerificador(d.slice(0, 12), p1) === Number(d[12]) &&
      digitoVerificador(d.slice(0, 13), p2) === Number(d[13])
    );
  }
  return false;
}

/** 000.000.000-00 ou 00.000.000/0000-00; outra coisa volta como veio. */
export function formatarDocumento(valor: string | null | undefined): string {
  const d = soDigitos(valor);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return valor ?? "";
}

export const clienteSchema = z.object({
  documentos: z.array(z.string().uuid()).max(100).optional(),
  nacionalidade: textoOpcional(80),
  estado_civil: textoOpcional(40),
  profissao: textoOpcional(80),
  nome: texto(200).default(""),
  documento: textoOpcional(20),
  rg: textoOpcional(30),
  /** Órgão expedidor do RG (ex.: SSP). */
  rg_orgao_expedidor: textoOpcional(20),
  rg_uf: textoOpcional(2),
  cnh: textoOpcional(30),
  telefone: textoOpcional(30),
  email: textoOpcional(200),
  nascimento: data,
  cep: textoOpcional(10),
  endereco: textoOpcional(200),
  numero: textoOpcional(20),
  complemento: textoOpcional(100),
  bairro: textoOpcional(100),
  cidade: textoOpcional(100),
  uf: textoOpcional(2),
});
export type ClienteDaNegociacao = z.infer<typeof clienteSchema>;

const camposDoVeiculo = {
  condicao: z.enum(["novo", "usado"]).optional().nullable(),
  regularizacao: regularizacaoSchema.optional(),
  codigo: textoOpcional(40),
  marca: textoOpcional(80),
  modelo: texto(120).default(""),
  versao: textoOpcional(160),
  ano_fabricacao: ano.optional().nullable(),
  ano_modelo: ano.optional().nullable(),
  km: z.number().int().min(0).max(10_000_000).optional().nullable(),
  cor: textoOpcional(40),
  combustivel: textoOpcional(40),
  cambio: textoOpcional(40),
  motor: textoOpcional(40),
  placa: textoOpcional(10),
  chassi: textoOpcional(30),
  renavam: textoOpcional(20),
};

export const veiculoDaNegociacaoSchema = z.object({
  ...camposDoVeiculo,
  /** Só na COMPRA: por quanto o carro vai ser anunciado ao entrar no estoque (0 = ainda não). */
  preco_venda_cents: centavos.optional().nullable(),
});
export type VeiculoDaNegociacao = z.infer<typeof veiculoDaNegociacaoSchema>;

export const trocaSchema = z.object({
  ...camposDoVeiculo,
  /** Quanto a loja avaliou o carro da troca. */
  valor_cents: centavos.default(0),
  /** Quanto o cliente ainda deve do financiamento da troca — a loja quita e isso sai do abatimento. */
  quitacao_cents: centavos.default(0),
  /** Se a troca entra no estoque ao concluir (padrão: sim, como "reservado" até ter preço). */
  entra_no_estoque: z.boolean().default(true),
  /** Credor do financiamento que grava a troca, quando há quitação. */
  gravame_credor: textoOpcional(120),
});
export type TrocaDaNegociacao = z.infer<typeof trocaSchema>;

export const pagamentoSchema = z.object({
  forma: z.enum(FORMAS_DE_PAGAMENTO),
  conta_id: z.string().uuid().optional().nullable(),
  juros_bps: z.number().int().min(0).max(10000).optional(),
  valor_cents: centavos,
  parcelas: z.number().int().min(1).max(120).default(1),
  valor_parcela_cents: centavos.optional().nullable(),
  banco: textoOpcional(80),
  primeiro_vencimento: data,
  observacao: textoOpcional(200),
  situacao: textoOpcional(80),
  data_emissao: data,
  data_pagamento: data,
  intervalo_dias: z.number().int().min(1).max(365).optional(),
  chave_pix: textoOpcional(200),
  /** Bandeira do cartão, quando a forma é cartão. */
  bandeira: textoOpcional(40),
});
export type PagamentoDaNegociacao = z.infer<typeof pagamentoSchema>;

export const negociacaoSchema = z.object({
  contrato: contratoSchema.optional().nullable(),
  tipo: z.enum(TIPOS_DE_NEGOCIACAO),
  modalidade: z.enum(["normal", "crediario", "reserva"]).optional(),
  contact_id: z.string().uuid().optional().nullable(),
  cliente: clienteSchema,
  veiculo_id: z.string().uuid().optional().nullable(),
  veiculo: veiculoDaNegociacaoSchema,
  valor_cents: centavos,
  desconto_cents: centavos.default(0),
  troca: trocaSchema.optional().nullable(),
  pagamentos: z.array(pagamentoSchema).max(20).default([]),
  comissao_cents: centavos.optional().nullable(),
  /** Quem vendeu. Vazio = quem abriu a negociação. A rota confere que é membro da organização. */
  vendedor_user_id: z.string().uuid().optional().nullable(),
  observacoes: textoOpcional(4000),
});
export type NegociacaoInput = z.infer<typeof negociacaoSchema>;

/** PATCH: tudo opcional, menos o tipo, que não muda depois de criada. */
export const negociacaoPatchSchema = negociacaoSchema.omit({ tipo: true }).partial();

// A projeção completa permite ler instalações anteriores à ativação do crediário,
// nas quais a coluna opcional modalidade ainda não existe. A RLS e o filtro de
// organização continuam aplicados por cada chamador.
export const COLUNAS_DA_NEGOCIACAO = "*";

export interface Negociacao {
  contrato?: DadosDoContrato | null;
  id: string;
  numero: number;
  modalidade?: "normal" | "crediario" | "reserva";
  tipo: TipoDeNegociacao;
  status: StatusDaNegociacao;
  contact_id: string | null;
  cliente: ClienteDaNegociacao;
  veiculo_id: string | null;
  veiculo: VeiculoDaNegociacao;
  valor_cents: number;
  desconto_cents: number;
  troca: TrocaDaNegociacao | null;
  troca_veiculo_id: string | null;
  pagamentos: PagamentoDaNegociacao[];
  vendedor_user_id: string | null;
  comissao_cents: number | null;
  observacoes: string | null;
  moeda: string;
  concluida_em: string | null;
  cancelada_em: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResumoDaNegociacao {
  /** Preço menos desconto (venda) ou o valor pago ao cliente (compra). */
  total_cents: number;
  /** Abatimento líquido da troca: avaliação menos quitação (pode ser negativo). */
  troca_liquida_cents: number;
  /** Soma das formas de pagamento. */
  pagamentos_cents: number;
  /** O que ainda falta cobrir. Negativo = passou do total. */
  saldo_cents: number;
}

type ParaResumo = Pick<
  NegociacaoInput,
  "tipo" | "valor_cents" | "desconto_cents" | "troca" | "pagamentos"
>;

export function resumoDaNegociacao(n: ParaResumo): ResumoDaNegociacao {
  const total =
    n.tipo === "venda" ? Math.max(0, n.valor_cents - (n.desconto_cents ?? 0)) : n.valor_cents;
  const troca =
    n.tipo === "venda" && n.troca ? (n.troca.valor_cents ?? 0) - (n.troca.quitacao_cents ?? 0) : 0;
  const pagos = (n.pagamentos ?? []).reduce((acc, p) => acc + p.valor_cents, 0);
  return {
    total_cents: total,
    troca_liquida_cents: troca,
    pagamentos_cents: pagos,
    saldo_cents: total - troca - pagos,
  };
}

/**
 * O que falta para fechar. Vazio = pode concluir. Textos em português; quem
 * mostra traduz.
 */
export function pendenciasParaConcluir(
  n: ParaResumo & Pick<NegociacaoInput, "cliente" | "veiculo" | "veiculo_id">,
): string[] {
  const faltas: string[] = [];
  if (!n.cliente.nome.trim()) faltas.push("Informe o nome do cliente.");
  if (!documentoValido(n.cliente.documento))
    faltas.push("Informe um CPF ou CNPJ válido do cliente.");
  if (n.tipo === "venda" && !n.veiculo_id) faltas.push("Escolha o veículo do estoque.");
  if (n.tipo === "compra" && !n.veiculo.modelo.trim())
    faltas.push("Informe o modelo do veículo comprado.");
  if (n.valor_cents <= 0)
    faltas.push(n.tipo === "venda" ? "Informe o preço de venda." : "Informe o valor da compra.");
  if (n.tipo === "venda" && n.troca && !n.troca.modelo.trim())
    faltas.push("Informe o modelo do veículo da troca.");
  for (const p of n.pagamentos) {
    // Toda forma de pagamento precisa da conta: é por ela que a venda entra nas
    // Movimentações do financeiro. Sem conta o trigger não gera o lançamento e o
    // dinheiro some do caixa.
    if (p.valor_cents > 0 && !p.conta_id) faltas.push("Selecione a conta de cada pagamento.");
    if (
      p.forma === "crediario" &&
      (!p.primeiro_vencimento || !p.conta_id || p.valor_cents < p.parcelas)
    )
      faltas.push("Informe conta, primeiro vencimento e valor válido do crediário.");
  }
  const { saldo_cents } = resumoDaNegociacao(n);
  if (saldo_cents > 0) faltas.push("Os pagamentos não cobrem o total.");
  if (saldo_cents < 0) faltas.push("Os pagamentos passam do total.");
  return faltas;
}

/** Título curto do veículo: "Fiat Argo Drive 1.0 2022/2023". */
export function tituloDoVeiculoDaNegociacao(
  v: Partial<VeiculoDaNegociacao> | null | undefined,
): string {
  if (!v) return "";
  const anos =
    v.ano_fabricacao && v.ano_modelo
      ? `${v.ano_fabricacao}/${v.ano_modelo}`
      : String(v.ano_modelo ?? v.ano_fabricacao ?? "");
  return [v.marca, v.modelo, v.versao, anos].filter((p) => p && String(p).trim()).join(" ");
}
