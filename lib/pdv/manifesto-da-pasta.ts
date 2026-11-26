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
 * Documentos com gerador saem com a avaliação real; os demais seguem como
 * `nao_implementado`. Recibo e quitação nascem dos recebimentos (rota /recibos),
 * por isso aqui só aguardam o evento.
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
  laudo_vistoria: "Laudo de vistoria",
  termo_entrega: "Termo de entrega",
  termo_recebimento: "Termo de recebimento",
  recibo_quitacao: "Recibo e termo de quitação",
  nota_promissoria: "Nota promissória",
  procuracao_condutor: "Indicação de condutor",
  procuracao_transferencia_entrada: "Procuração de transferência do veículo recebido",
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

const NO_CONTRATO = "Gerado como anexo do contrato, impresso após as assinaturas.";
/** Anexo que o PDF do contrato de venda já imprime (ver anexosDaVenda). */
function anexo(documento: DocumentoDaPasta): ItemDaPasta {
  return {
    documento,
    titulo: TITULO_DO_DOCUMENTO[documento],
    aplicacao: "aplica",
    situacao: "pronto",
    motivo: NO_CONTRATO,
    pendencias: [],
  };
}

/** Sai no contrato; o que falta é preenchido no ato da entrega (não faz a minuta). */
function termoDeEntrega(r: RetratoDaOperacao): ItemDaPasta {
  const faltam = r.termo_entrega ?? [];
  if (!faltam.length) return anexo("termo_entrega");
  return {
    ...anexo("termo_entrega"),
    situacao: "aguarda_evento",
    motivo: `${NO_CONTRATO} Complete no ato da entrega.`,
    pendencias: faltam,
  };
}

/** Como o termo de entrega: o que falta é preenchido no ato do recebimento. */
function termoDeRecebimento(r: RetratoDaOperacao): ItemDaPasta {
  const faltam = r.termo_recebimento ?? [];
  if (!faltam.length) return anexo("termo_recebimento");
  return {
    ...anexo("termo_recebimento"),
    situacao: "aguarda_evento",
    motivo: `${NO_CONTRATO} Complete no ato do recebimento.`,
    pendencias: faltam,
  };
}

/** Uma nota por parcela de promissória ou crediário; boleto e cheque já são o título. */
function notaPromissoria(r: RetratoDaOperacao, parcelasALoja: boolean): ItemDaPasta {
  const faltam = r.nota_promissoria;
  if (!faltam)
    return item(
      "nota_promissoria",
      "nao_aplica",
      parcelasALoja
        ? "Parcelas em boleto ou cheque: o próprio título cobre a parcela."
        : "Sem pagamento futuro à própria loja.",
    );
  return {
    documento: "nota_promissoria",
    titulo: TITULO_DO_DOCUMENTO.nota_promissoria,
    aplicacao: "aplica",
    situacao: faltam.length ? "faltam_dados" : "pronto",
    motivo: faltam.length
      ? "Complete os dados: título de crédito não sai com campo em branco."
      : "Uma nota por parcela paga direto à loja.",
    pendencias: faltam,
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
    venda
      ? anexo("laudo_vistoria")
      : item("laudo_vistoria", "nao_aplica", "Entrada por compra usa vistoria de entrada própria."),
    venda ? termoDeEntrega(r) : item("termo_entrega", "nao_aplica", "Compra pela loja não tem entrega."),
    venda && b.troca
      ? termoDeRecebimento(r)
      : item(
          "termo_recebimento",
          b.troca || !venda ? "aplica" : "nao_aplica",
          b.troca || !venda
            ? "A loja recebe um veículo nesta operação."
            : "Venda sem troca: a loja não recebe veículo.",
        ),
    r.valores.pagamentos_previstos_cents > 0
      ? {
          ...anexo("recibo_quitacao"),
          situacao: "aguarda_evento",
          motivo: "Recibo emitido a cada recebimento confirmado; termo de quitação quando o saldo zerar.",
        }
      : item("recibo_quitacao", "nao_aplica", "Sem pagamentos na operação."),
    notaPromissoria(r, venda && b.parcelas_a_loja),
    venda
      ? anexo("procuracao_condutor")
      : item("procuracao_condutor", "nao_aplica", "Não se aplica à compra pela loja."),
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
