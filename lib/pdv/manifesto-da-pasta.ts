/**
 * MANIFESTO DA PASTA DOCUMENTAL — quais documentos a operação exige e em que pé
 * cada um está. Lê só o retrato (./retrato-da-operacao.ts); não consulta banco
 * nem decide pagamento.
 *
 * Regras (análise funcional em output/documentos-veiculares, não validação
 * jurídica):
 *  - documento não implementado aparece explicitamente, com o motivo; nunca some;
 *  - quando a condição de aplicação ainda não é registrada no sistema (garantia
 *    oferecida, despachante contratado, proprietário registral…), o item diz isso
 *    em vez de presumir que não se aplica;
 *  - a pasta só é completa quando todo documento aplicável está pronto e nenhuma
 *    condição ficou sem registro.
 *
 * Hoje só o contrato de venda tem gerador. Cada etapa seguinte troca o
 * `nao_implementado` do seu documento pela avaliação real.
 */
import type { PendenciaDoDocumento, RetratoDaOperacao } from "./retrato-da-operacao";

export const DOCUMENTOS_DA_PASTA = [
  "contrato",
  "laudo_vistoria",
  "termo_entrega",
  "termo_recebimento",
  "recibo_quitacao",
  "nota_promissoria",
  "procuracao_condutor",
  "procuracao_transferencia_entrada",
  "procuracao_transferencia_comprador",
  "declaracao_residencia",
  "garantia_contratual",
] as const;
export type DocumentoDaPasta = (typeof DOCUMENTOS_DA_PASTA)[number];

export const TITULO_DO_DOCUMENTO: Record<DocumentoDaPasta, string> = {
  contrato: "Contrato de compra e venda",
  laudo_vistoria: "Laudo de vistoria (Anexo I)",
  termo_entrega: "Termo de entrega (Anexo II)",
  termo_recebimento: "Termo de recebimento (Anexo III)",
  recibo_quitacao: "Recibo e termo de quitação",
  nota_promissoria: "Nota promissória",
  procuracao_condutor: "Procuração de condutor (Anexo IV)",
  procuracao_transferencia_entrada: "Procuração de transferência do veículo recebido (Anexo V)",
  procuracao_transferencia_comprador: "Procuração para transferência em nome do comprador",
  declaracao_residencia: "Declaração de residência",
  garantia_contratual: "Garantia contratual",
};

export type SituacaoDoDocumento =
  "pronto" | "faltam_dados" | "aguarda_evento" | "nao_se_aplica" | "nao_implementado";

export type AplicacaoDoDocumento = "aplica" | "nao_aplica" | "condicao_nao_registrada";

export interface ItemDaPasta {
  documento: DocumentoDaPasta;
  titulo: string;
  aplicacao: AplicacaoDoDocumento;
  situacao: SituacaoDoDocumento;
  motivo: string;
  pendencias: PendenciaDoDocumento[];
}

export interface ManifestoDaPasta {
  itens: ItemDaPasta[];
  /** Documentos aplicáveis (ou de condição não registrada) que ainda não têm gerador. */
  anexos_pendentes: DocumentoDaPasta[];
  completa: boolean;
}

const SEM_GERADOR = "Modelo ainda não implementado.";
const CONDICAO = "A condição de aplicação ainda não é registrada na negociação.";

function item(
  documento: DocumentoDaPasta,
  aplicacao: AplicacaoDoDocumento,
  motivo: string,
): ItemDaPasta {
  return {
    documento,
    titulo: TITULO_DO_DOCUMENTO[documento],
    aplicacao,
    situacao: aplicacao === "nao_aplica" ? "nao_se_aplica" : "nao_implementado",
    motivo: aplicacao === "nao_aplica" ? motivo : `${motivo} ${SEM_GERADOR}`,
    pendencias: [],
  };
}

function contrato(r: RetratoDaOperacao): ItemDaPasta {
  const base = {
    documento: "contrato" as const,
    titulo: TITULO_DO_DOCUMENTO.contrato,
    aplicacao: "aplica" as const,
  };
  if (r.cenario === "compra_direta")
    return {
      ...base,
      situacao: "nao_implementado",
      motivo: "Compra pela loja exige um contrato de aquisição próprio. " + SEM_GERADOR,
      pendencias: [],
    };
  // Mesma regra de ./versao-do-contrato.ts: aviso também faz a minuta.
  const faltam = r.pendencias.length > 0;
  return {
    ...base,
    situacao: faltam ? "faltam_dados" : "pronto",
    motivo: faltam
      ? "Minuta disponível; complete os dados para a versão de assinatura."
      : "Dados suficientes para a versão de assinatura.",
    pendencias: r.pendencias,
  };
}

export function manifestoDaPasta(r: RetratoDaOperacao): ManifestoDaPasta {
  const venda = r.cenario !== "compra_direta";
  const b = r.blocos;
  const itens: ItemDaPasta[] = [
    contrato(r),
    item(
      "laudo_vistoria",
      venda ? "aplica" : "nao_aplica",
      venda
        ? "Toda venda tem vistoria de saída."
        : "Entrada por compra usa vistoria de entrada própria.",
    ),
    item(
      "termo_entrega",
      venda ? "aplica" : "nao_aplica",
      venda ? "Registra a entrega real do veículo vendido." : "Compra pela loja não tem entrega.",
    ),
    item(
      "termo_recebimento",
      b.troca || !venda ? "aplica" : "nao_aplica",
      b.troca || !venda
        ? "A loja recebe um veículo nesta operação."
        : "Venda sem troca: a loja não recebe veículo.",
    ),
    item(
      "recibo_quitacao",
      r.valores.pagamentos_previstos_cents > 0 ? "aplica" : "nao_aplica",
      r.valores.pagamentos_previstos_cents > 0
        ? "Cada recebimento confirmado gera um recibo."
        : "Sem pagamentos na operação.",
    ),
    item(
      "nota_promissoria",
      venda && b.parcelas_a_loja ? "aplica" : "nao_aplica",
      venda && b.parcelas_a_loja
        ? "Há pagamento futuro à loja."
        : "Sem pagamento futuro à própria loja.",
    ),
    item(
      "procuracao_condutor",
      venda ? "condicao_nao_registrada" : "nao_aplica",
      venda
        ? `Depende de o veículo estar registrado em nome da loja. ${CONDICAO}`
        : "Não se aplica à compra pela loja.",
    ),
    item(
      "procuracao_transferencia_entrada",
      b.troca || !venda ? "condicao_nao_registrada" : "nao_aplica",
      b.troca || !venda
        ? `Só na impossibilidade da ATPV-e e com o preço quitado. ${CONDICAO}`
        : "A loja não recebe veículo.",
    ),
    item(
      "procuracao_transferencia_comprador",
      venda ? "condicao_nao_registrada" : "nao_aplica",
      venda
        ? `Só quando o comprador contrata o despachante da loja. ${CONDICAO}`
        : "Não se aplica à compra pela loja.",
    ),
    item(
      "declaracao_residencia",
      "condicao_nao_registrada",
      `Só quando o cliente não tem comprovante em seu nome. ${CONDICAO}`,
    ),
    item(
      "garantia_contratual",
      venda ? "condicao_nao_registrada" : "nao_aplica",
      venda
        ? `Só quando a loja oferece garantia contratual. ${CONDICAO}`
        : "Não se aplica a quem vende à loja.",
    ),
  ];
  const anexos_pendentes = itens
    .filter((i) => i.documento !== "contrato" && i.situacao === "nao_implementado")
    .map((i) => i.documento);
  return {
    itens,
    anexos_pendentes,
    completa: itens.every((i) => i.situacao === "pronto" || i.situacao === "nao_se_aplica"),
  };
}
