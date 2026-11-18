/**
 * CLÁUSULAS FIXAS DO CONTRATO — o texto do modelo da loja (ficha 01 de
 * output/documentos-veiculares), com as variáveis preenchidas pela fotografia
 * da negociação. Não há editor: o texto é este, e cada bloco entra só quando a
 * operação o exige (troca, financiamento, parcela à loja, venda fora do
 * estabelecimento, garantia contratual).
 *
 * Regras de redação, vigiadas por ./contrato-modelo.test.ts:
 *  - a palavra "troca" só aparece em bloco condicional à troca — o veículo
 *    recebido é chamado de VEÍCULO EM PAGAMENTO;
 *  - Anexo III e Anexo V (documentos do veículo recebido) só são citados com troca;
 *  - dado ausente vira lacuna visível ("____"), nunca some da frase.
 *
 * Análise funcional do modelo; não é validação jurídica.
 */
import { formatarPreco } from "@/lib/veiculos/regras";
import { formatarDocumento, type Negociacao } from "./regras";
import type { BlocosDaOperacao } from "./retrato-da-operacao";
import { inteiroPorExtenso } from "./valor-por-extenso";

export interface SecaoDoContrato {
  titulo: string;
  itens: string[];
}

export interface ClausulasFixas {
  /** Itens 2.x, depois da tabela de pagamento. */
  pagamento: string[];
  /** Cláusulas seguintes ao pagamento, na ordem do modelo (3ª em diante). */
  secoes: SecaoDoContrato[];
}

const LACUNA = "________________";
const txt = (v?: string | number | null) =>
  v == null || String(v).trim() === "" ? LACUNA : String(v);
const data = (v?: string | null) => (v ? v.slice(0, 10).split("-").reverse().join("/") : LACUNA);

/** "30 (trinta) dias úteis"; sem número, lacuna no lugar do prazo. */
export function prazo(n: number | null | undefined, unidade = "dias"): string {
  return n == null ? `____ ${unidade}` : `${n} (${inteiroPorExtenso(n)}) ${unidade}`;
}

export function clausulasFixas(n: Negociacao, blocos: BlocosDaOperacao): ClausulasFixas {
  const d = n.contrato ?? {};
  const e = d.empresa;
  const preco = (v: number) => formatarPreco(v, n.moeda || "BRL");
  const venda = n.tipo === "venda";
  const troca = blocos.troca && n.troca ? n.troca : null;
  const bancos = n.pagamentos
    .filter((p) => p.forma === "financiamento")
    .map((p) => p.banco)
    .filter(Boolean)
    .join(", ");
  const foro = [n.cliente.cidade, n.cliente.uf].filter(Boolean).join("/");
  const cidadeLoja = [e?.cidade, e?.uf].filter(Boolean).join("/");

  const gerais: SecaoDoContrato = {
    titulo: "Disposições gerais",
    itens: [
      `Os dados pessoais das partes são tratados para a execução deste contrato, o cumprimento de obrigações legais e regulatórias (registro no Detran, obrigações fiscais) e o exercício regular de direitos, e são compartilhados apenas com órgãos de trânsito, instituições financeiras envolvidas na operação, despachante e autoridades, quando necessário. O titular pode exercer os direitos do art. 18 da Lei 13.709/2018 (LGPD) pelo e-mail ${txt(d.email_lgpd || e?.email)}.`,
      ...(venda && d.venda_fora_do_estabelecimento
        ? [
            "Contratada fora do estabelecimento comercial, a compra pode ser desfeita pelo COMPRADOR em até 7 (sete) dias contados da assinatura ou do recebimento do veículo, com devolução imediata dos valores pagos, monetariamente atualizados (art. 49 do Código de Defesa do Consumidor).",
          ]
        : []),
      "A tolerância de uma parte com o descumprimento da outra não constitui novação nem renúncia de direito.",
      "As comunicações entre as partes serão feitas pelos endereços, telefones e e-mails indicados na qualificação, e cada parte deve informar à outra qualquer alteração.",
      `As partes declaram que leram este contrato, que tiveram as dúvidas esclarecidas e que o atendimento foi prestado por ${txt(d.atendido_por)}.`,
      `Fica eleito o foro do domicílio do COMPRADOR${foro ? ` (${foro})` : ""} para dirimir questões deste contrato (art. 101, I, do Código de Defesa do Consumidor).`,
    ],
  };

  // A compra pela loja ainda não tem modelo de aquisição (sempre minuta):
  // entra só o que vale para qualquer contrato.
  if (!venda) return { pagamento: [], secoes: [gerais] };

  const pagamento: string[] = [
    ...(blocos.financiamento_bancario
      ? [
          `A parcela financiada é objeto de contrato autônomo entre o COMPRADOR e a instituição financeira${bancos ? ` (${bancos})` : ""}, que informa o Custo Efetivo Total (CET), as taxas e os encargos. A VENDEDORA não é parte desse contrato e só considera o preço pago com a liberação do crédito.`,
        ]
      : []),
    ...(blocos.parcelas_a_loja
      ? [
          "As parcelas devidas diretamente à VENDEDORA não têm juros remuneratórios além dos indicados na tabela acima; a nota promissória emitida fica vinculada a este contrato e não circula de forma autônoma.",
          "O atraso no pagamento de parcela devida à VENDEDORA sujeita o COMPRADOR a multa de 2% (dois por cento) (art. 52, § 1º, do Código de Defesa do Consumidor), juros de mora de 1% (um por cento) ao mês e correção monetária pelo IPCA. O COMPRADOR pode antecipar parcelas com redução proporcional dos juros (art. 52, § 2º).",
        ]
      : []),
    ...(troca && blocos.quitacao_da_troca
      ? [
          `A VENDEDORA assume quitar o financiamento que grava o VEÍCULO EM PAGAMENTO${troca.gravame_credor ? `, junto a ${troca.gravame_credor}` : `, junto a ${LACUNA}`}, no valor de ${preco(troca.quitacao_cents)}, em até ${prazo(d.quitacao_troca_prazo_dias, "dias úteis")} contados do recebimento do veículo e dos documentos. Diferença entre o saldo informado e o saldo efetivamente quitado será acertada entre as partes em até 10 (dez) dias.`,
        ]
      : []),
    "A VENDEDORA dará recibo de cada valor recebido.",
  ];

  const deb = d.debitos ?? {};
  const regularidade: SecaoDoContrato = {
    titulo: "Da regularidade do veículo",
    itens: [
      `A VENDEDORA informa, em atenção à Lei 13.111/2015 e ao art. 31 do Código de Defesa do Consumidor, o resultado da consulta realizada em ${data(d.consulta_debitos_em)}: IPVA e licenciamento: ${txt(deb.ipva_licenciamento)}; multas: ${txt(deb.multas)}; restrições: ${txt(deb.restricoes)}; leilão ou sinistro: ${txt(deb.leilao_sinistro)}; recall pendente: ${txt(deb.recall)}. Os débitos com fato gerador anterior à entrega ficam a cargo ${deb.responsavel === "comprador" ? "do COMPRADOR" : deb.responsavel === "vendedora" ? "da VENDEDORA" : `de ${LACUNA}`}.`,
      "O estado de conservação, os itens e os acessórios do veículo são os descritos no Anexo I, conferidos pelo COMPRADOR.",
      `O COMPRADOR ${d.test_drive === "fez" ? "FEZ" : d.test_drive === "dispensou" ? "DISPENSOU" : LACUNA} o test-drive. A avaliação prévia não exclui a garantia legal por vício oculto.`,
      ...(troca
        ? [
            "O COMPRADOR declara que o VEÍCULO EM PAGAMENTO é de sua propriedade, está livre de ônus não informados neste contrato, e responde pelos débitos, multas e restrições com fato gerador anterior à entrega dele à VENDEDORA.",
          ]
        : []),
    ],
  };

  const entrega: SecaoDoContrato = {
    titulo: "Da entrega",
    itens: [
      `O veículo será entregue em ${data(d.entrega_em)}, às ${txt(d.entrega_hora)}, mediante termo de entrega (Anexo II)${troca ? `; o VEÍCULO EM PAGAMENTO será recebido pela VENDEDORA em ${data(d.recebimento_troca_em)}, às ${txt(d.recebimento_troca_hora)}, mediante termo de recebimento (Anexo III)` : ""}.`,
      "A partir da entrega, o COMPRADOR responde pela guarda, pelo uso, pelos tributos e pelas infrações relativas ao veículo.",
      ...(troca
        ? [
            "Até a entrega do VEÍCULO EM PAGAMENTO, o COMPRADOR responde por ele; a partir do recebimento, a VENDEDORA.",
          ]
        : []),
      "Infração cometida entre a entrega e a transferência de propriedade terá o condutor indicado nos termos do art. 257, § 7º, do Código de Trânsito Brasileiro e da Resolução CONTRAN 918/2022, com o formulário do Anexo IV; a parte notificada avisa a outra em até 5 (cinco) dias.",
      "A parte que pagar multa ou débito de responsabilidade da outra será reembolsada em até 10 (dez) dias do aviso, com o comprovante.",
      "A responsabilidade penal por fato ocorrido na condução do veículo é pessoal de quem o conduzia.",
    ],
  };

  // Sem escolha explícita, venda com parcelas à loja conta da quitação; à vista, da assinatura.
  const contaDeEfetivo = d.transferencia_conta_de ?? (blocos.parcelas_a_loja ? "quitacao" : "assinatura");
  const contaDe = contaDeEfetivo === "quitacao" ? "da quitação do preço" : "da assinatura";
  const taxas =
    d.transferencia_taxas_por === "vendedora"
      ? "pela VENDEDORA"
      : d.transferencia_taxas_por === "comprador"
        ? "pelo COMPRADOR"
        : `por ${LACUNA}`;
  const transferencia: SecaoDoContrato = {
    titulo: "Da transferência",
    itens: [
      blocos.financiamento_bancario
        ? `O veículo será transferido com o gravame da instituição financeira${bancos ? ` (${bancos})` : ""}. A VENDEDORA emitirá a ATPV-e (Resolução CONTRAN 809/2020) em até ${prazo(d.transferencia_prazo_dias, "dias úteis")} contados da assinatura.`
        : `A VENDEDORA emitirá a ATPV-e (Resolução CONTRAN 809/2020) em até ${prazo(d.transferencia_prazo_dias, "dias úteis")} contados ${contaDe}.`,
      "O COMPRADOR registrará a transferência em até 30 (trinta) dias da emissão da ATPV-e (art. 123, § 1º, e art. 233 do Código de Trânsito Brasileiro).",
      "A VENDEDORA fará a comunicação de venda ao Detran (art. 134 do Código de Trânsito Brasileiro).",
      `As taxas de transferência serão pagas ${taxas}.${d.despachante_cents ? ` O serviço de despachante, opcional, custa ${preco(d.despachante_cents)}.` : ""}`,
      ...(troca
        ? [
            "O COMPRADOR emitirá a ATPV-e do VEÍCULO EM PAGAMENTO em favor da VENDEDORA em até 5 (cinco) dias úteis do recebimento, pelo gov.br ou no Detran, com os documentos do Anexo V.",
          ]
        : []),
    ],
  };

  const garantia: SecaoDoContrato = {
    titulo: "Da garantia",
    itens: [
      "A VENDEDORA responde pelos vícios do veículo nos termos dos arts. 18, 24 e 25 do Código de Defesa do Consumidor, sendo nula cláusula que a exonere (art. 51, I). O prazo para reclamar é de 90 (noventa) dias (art. 26, II), contado da entrega ou, para vício oculto, de quando ele se manifestar (art. 26, §§ 1º e 3º).",
      "A reclamação comprovada suspende o prazo até a resposta da VENDEDORA. Não sanado o vício em 30 (trinta) dias (art. 18, § 1º), o COMPRADOR pode escolher: (a) a substituição do veículo por outro equivalente; (b) a restituição do valor pago, atualizado; ou (c) o abatimento proporcional do preço.",
      "Não é vício o desgaste natural de peças compatível com a idade e a quilometragem informadas, nem o dano causado por uso inadequado, acidente ou intervenção de terceiros depois da entrega.",
      ...(d.garantia_contratual
        ? [
            `A VENDEDORA concede, além da garantia legal, garantia contratual (art. 50 do Código de Defesa do Consumidor) de ${txt(d.garantia_contratual.prazo)}, cobrindo ${txt(d.garantia_contratual.componentes)}.`,
          ]
        : []),
      `A avaliação do vício será feita em ${txt(cidadeLoja)}, e a remoção do veículo até lá, quando ele não puder rodar, fica a cargo da VENDEDORA.`,
    ],
  };

  const inadimplemento: SecaoDoContrato = {
    titulo: "Do inadimplemento",
    itens: [
      ...(blocos.financiamento_bancario
        ? [
            `Não liberado o financiamento em ${prazo(d.financiamento_prazo_dias)}, o COMPRADOR terá 5 (cinco) dias úteis para pagar o saldo por outro meio; não o fazendo, o contrato se desfaz e os valores pagos são restituídos em até 10 (dez) dias.`,
          ]
        : []),
      "O atraso no pagamento que persista por 15 (quinze) dias depois de notificação permite à parte prejudicada exigir o cumprimento ou resolver o contrato (art. 475 do Código Civil).",
      `Resolvido o contrato por culpa do COMPRADOR, a VENDEDORA restituirá o que recebeu, retidas as despesas comprovadas, os danos ao veículo e ${d.retencao_percentual_mes == null ? "____%" : `${String(d.retencao_percentual_mes).replace(".", ",")}%`} ao mês pelo uso, sem perda total das parcelas pagas (art. 53 do Código de Defesa do Consumidor).`,
      `Descumprindo a VENDEDORA a entrega ou a transferência, o COMPRADOR pode exigir o cumprimento ou resolver o contrato, com restituição integral do que pagou, atualizado${troca && blocos.quitacao_da_troca ? ", e a VENDEDORA responde pela quitação do gravame do VEÍCULO EM PAGAMENTO que assumiu" : ""}.`,
    ],
  };

  const anexos: SecaoDoContrato = {
    titulo: "Dos anexos e da assinatura",
    itens: [
      [
        "Integram este contrato: Anexo I (estado do veículo)",
        "Anexo II (termo de entrega)",
        ...(troca ? ["Anexo III (termo do VEÍCULO EM PAGAMENTO)"] : []),
        "Anexo IV (indicação de condutor)",
        ...(troca ? ["Anexo V (documentos do VEÍCULO EM PAGAMENTO)"] : []),
        ...(blocos.parcelas_a_loja ? ["nota promissória"] : []),
        ...(d.garantia_contratual ? ["termo de garantia contratual"] : []),
      ].join(", ") + ".",
      "Este contrato pode ser assinado em papel ou eletronicamente (MP 2.200-2/2001, art. 10, § 2º); na assinatura eletrônica, dispensam-se as testemunhas (art. 784, § 4º, do Código de Processo Civil).",
    ],
  };

  return {
    pagamento,
    secoes: [regularidade, entrega, transferencia, garantia, inadimplemento, gerais, anexos],
  };
}

/** Linha da assinatura da loja: "p/ NOME, cargo, CPF". */
export function assinanteDaLoja(n: Negociacao): string | null {
  const d = n.contrato;
  if (!d?.representante_nome?.trim()) return null;
  return [
    `p/ ${d.representante_nome.trim()}`,
    d.representante_cargo?.trim() || null,
    d.representante_cpf?.trim() ? `CPF ${formatarDocumento(d.representante_cpf)}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}
