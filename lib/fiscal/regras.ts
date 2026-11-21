/**
 * Escolha da regra fiscal. O lojista escolhe a OPERAÇÃO ("Comprei de pessoa
 * física"); o CFOP sai da tabela `regras_fiscais` da loja, nunca da tela.
 */

export type OperacaoFiscal = "ENT_COMPRA_PF" | "ENT_TROCA" | "SAI_VENDA";
export type TipoPessoa = "PF" | "PJ_contrib" | "PJ_nao_contrib";
export type DestinoFiscal = "interna" | "interestadual";

export interface RegraFiscal {
  operacao: string;
  destino: string;
  tipo_pessoa: string;
  presencial: boolean;
  cfop: string;
  natureza_operacao: string;
  csosn_ou_cst: string | null;
  aliq_icms: number | null;
  reducao_bc_pct: number | null;
  cst_ibscbs: string | null;
  /** CST de PIS/COFINS; ausente = "07" (isento). */
  cst_pis?: string;
  cst_cofins?: string;
  cclasstrib: string | null;
  texto_inf_adic: string | null;
  validado_contador: boolean;
  ativo: boolean;
}

export interface EntradaDaRegra {
  operacao: OperacaoFiscal;
  ufEmitente: string;
  ufContraparte: string;
  tipoPessoa: TipoPessoa;
  presencial: boolean;
}

export interface RegraEscolhida {
  regra: RegraFiscal;
  destino: DestinoFiscal;
  /** idDest da NF-e: 1 interna, 2 interestadual. Vem do 1º dígito do CFOP. */
  localDestino: 1 | 2 | 3;
}

export function destinoPorUf(ufEmitente: string, ufContraparte: string): DestinoFiscal {
  return ufEmitente.trim().toUpperCase() === ufContraparte.trim().toUpperCase() ? "interna" : "interestadual";
}

/** 1º dígito do CFOP define o destino: 1/5 interno, 2/6 interestadual, 3/7 exterior. */
export function localDestinoDoCfop(cfop: string): 1 | 2 | 3 {
  const d = cfop[0];
  if (d === "2" || d === "6") return 2;
  if (d === "3" || d === "7") return 3;
  return 1;
}

/**
 * Venda presencial a consumidor de outra UF: a regra semeada já traz CFOP 5.102,
 * então idDest sai 1 (tratada como interna) sem caso especial aqui.
 * Retorna null quando a loja não tem regra ativa para a combinação.
 */
export function escolherRegra(regras: RegraFiscal[], e: EntradaDaRegra): RegraEscolhida | null {
  const destino = destinoPorUf(e.ufEmitente, e.ufContraparte);
  const regra = regras.find(
    (r) =>
      r.ativo &&
      r.operacao === e.operacao &&
      r.destino === destino &&
      r.tipo_pessoa === e.tipoPessoa &&
      r.presencial === e.presencial,
  );
  if (!regra) return null;
  return { regra, destino, localDestino: localDestinoDoCfop(regra.cfop) };
}

/**
 * Regime normal (CRT 3) só emite em produção com a regra validada pelo contador.
 * Devolve a mensagem de bloqueio, ou null quando pode seguir.
 */
export function bloqueioDeProducao(crt: number | null, ambiente: string, regra: RegraFiscal): string | null {
  if (ambiente !== "producao") return null;
  if (crt === 3 && !regra.validado_contador) {
    return "Regra fiscal ainda não validada pelo contador. No regime normal, a emissão em produção fica bloqueada até a validação.";
  }
  return null;
}
