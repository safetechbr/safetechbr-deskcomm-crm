/** Tradução entre o nosso modelo (provider.ts) e o JSON da Focus NFe v2. */
import type { DocumentoParaEmitir, ItemNfe, RejeicaoFiscal, ResultadoDocumento, StatusDocumento } from "../provider";

const reais = (cents: number) => Math.round(cents) / 100;
const arred = (n: number) => Math.round(n * 100) / 100;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : v == null ? null : String(v));

const STATUS: Record<string, StatusDocumento> = {
  processando_autorizacao: "processando",
  autorizado: "autorizada",
  cancelado: "cancelada",
  erro_autorizacao: "rejeitada",
  denegado: "denegada",
};

const int = (v: unknown): number | null => {
  const n = Number(v);
  return v == null || v === "" || !Number.isInteger(n) ? null : n;
};

export const statusDaFocus = (s: unknown): StatusDocumento => STATUS[String(s)] ?? "processando";

/** Explicações em português claro para rejeições comuns. */
const EXPLICACOES: Record<string, string> = {
  "204": "Esta nota já foi enviada à SEFAZ (número duplicado). Confira a numeração em Série e numeração.",
  "225": "O formato da nota está fora do padrão da SEFAZ. Revise os dados do veículo e da pessoa.",
  "233": "A inscrição estadual da pessoa não está cadastrada na SEFAZ.",
  "280": "O certificado digital da loja não foi aceito. Envie o certificado A1 novamente.",
  "281": "O certificado digital da loja está vencido. Envie um novo.",
  "539": "Já existe uma nota com este número e dados diferentes. Ajuste a numeração.",
  "778": "O NCM informado não existe. Corrija o NCM no cadastro do veículo.",
};

export function rejeicaoDe(codigo: string | null, mensagem: string): RejeicaoFiscal {
  const explicacao =
    (codigo && EXPLICACOES[codigo]) ||
    "A nota foi recusada. Leia a mensagem da SEFAZ abaixo, corrija o dado indicado e emita de novo.";
  return { codigo, mensagem, explicacao };
}

/** Erro de validação da própria Focus (HTTP 4xx), antes de chegar à SEFAZ. */
export function rejeicaoDeRequisicao(json: Record<string, unknown>): RejeicaoFiscal {
  const erros = Array.isArray(json.erros)
    ? (json.erros as Array<Record<string, unknown>>).map((e) => str(e.mensagem)).filter(Boolean).join("; ")
    : "";
  return rejeicaoDe(str(json.codigo), erros || str(json.mensagem) || "Requisição recusada pelo provedor fiscal.");
}

export function resultadoDeConsulta(json: Record<string, unknown>): ResultadoDocumento {
  const status = statusDaFocus(json.status);
  const rejeitou = status === "rejeitada" || status === "denegada";
  return {
    status,
    numero: int(json.numero),
    serie: int(json.serie),
    chave: str(json.chave_nfe),
    protocolo: str(json.protocolo ?? json.protocolo_sefaz),
    xmlUrl: str(json.caminho_xml_nota_fiscal),
    pdfUrl: str(json.caminho_danfe),
    xmlCancelamentoUrl: str(json.caminho_xml_cancelamento),
    rejeicao: rejeitou ? rejeicaoDe(str(json.status_sefaz), str(json.mensagem_sefaz) ?? "Sem mensagem da SEFAZ.") : null,
    bruto: json,
  };
}

export function itemParaFocus(i: ItemNfe, n: number) {
  const bruto = arred(reais(i.valorUnitarioCents) * i.quantidade);
  const base: Record<string, unknown> = {
    numero_item: n,
    codigo_produto: i.codigo,
    descricao: i.descricao,
    codigo_ncm: i.ncm,
    cfop: i.cfop,
    unidade_comercial: "UN",
    quantidade_comercial: i.quantidade,
    valor_unitario_comercial: reais(i.valorUnitarioCents),
    valor_bruto: bruto,
    unidade_tributavel: "UN",
    quantidade_tributavel: i.quantidade,
    valor_unitario_tributavel: reais(i.valorUnitarioCents),
    inclui_no_total: 1,
    icms_origem: i.origem,
    icms_situacao_tributaria: i.situacaoIcms,
    pis_situacao_tributaria: i.cstPis ?? "07",
    cofins_situacao_tributaria: i.cstCofins ?? "07",
    informacoes_adicionais_item: i.informacoesAdicionais,
  };
  if (i.aliquotaIcms != null) {
    const baseCalc = arred(bruto * (1 - (i.reducaoBcPct ?? 0) / 100));
    base.icms_modalidade_base_calculo = 3;
    base.icms_base_calculo = baseCalc;
    base.icms_aliquota = i.aliquotaIcms;
    base.icms_valor = arred((baseCalc * i.aliquotaIcms) / 100);
    if (i.reducaoBcPct != null) base.icms_reducao_base_calculo = i.reducaoBcPct;
  }
  if (i.ibsCbs) {
    base.ibs_cbs_situacao_tributaria = i.ibsCbs.cst;
    base.ibs_cbs_classificacao_tributaria = i.ibsCbs.cClassTrib;
  }
  return base;
}

export function payloadNfe(d: DocumentoParaEmitir): Record<string, unknown> {
  const e = d.emitente;
  const p = d.destinatario;
  const doc = p.documento.replace(/\D/g, "");
  const itens = d.itens.map((i, k) => itemParaFocus(i, k + 1));
  const total = arred(itens.reduce((s, i) => s + (i.valor_bruto as number), 0));
  return {
    natureza_operacao: d.naturezaOperacao,
    data_emissao: d.dataEmissao,
    tipo_documento: d.tipo,
    local_destino: d.localDestino,
    finalidade_emissao: d.finalidade,
    consumidor_final: d.consumidorFinal ? 1 : 0,
    presenca_comprador: d.presencaComprador,
    serie: d.serie,
    numero: d.numero,
    cnpj_emitente: e.cnpj.replace(/\D/g, ""),
    nome_emitente: e.razaoSocial,
    nome_fantasia_emitente: e.nomeFantasia,
    inscricao_estadual_emitente: e.inscricaoEstadual,
    regime_tributario_emitente: e.crt,
    logradouro_emitente: e.logradouro,
    numero_emitente: e.numero,
    bairro_emitente: e.bairro,
    municipio_emitente: e.municipio,
    uf_emitente: e.uf,
    cep_emitente: e.cep,
    nome_destinatario: p.nome,
    ...(doc.length === 14 ? { cnpj_destinatario: doc } : { cpf_destinatario: doc }),
    indicador_inscricao_estadual_destinatario: p.indicadorIe,
    inscricao_estadual_destinatario: p.inscricaoEstadual,
    logradouro_destinatario: p.logradouro,
    numero_destinatario: p.numero,
    bairro_destinatario: p.bairro,
    codigo_municipio_destinatario: p.codigoMunicipio ?? undefined,
    municipio_destinatario: p.municipio,
    uf_destinatario: p.uf,
    cep_destinatario: p.cep,
    modalidade_frete: 9,
    valor_produtos: total,
    valor_total: total,
    informacoes_adicionais_contribuinte: d.informacoesAdicionais,
    formas_pagamento: [{
      forma_pagamento: d.formaPagamento,
      valor_pagamento: d.formaPagamento === "90" ? 0 : total,
    }],
    items: itens,
  };
}
