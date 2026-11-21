/**
 * CLÁUSULAS FIXAS DO CONTRATO — o texto do modelo da loja (ficha 01 de
 * output/documentos-veiculares), com as variáveis preenchidas pela fotografia
 * da negociação. Não há editor: o texto é este, e cada bloco entra só quando a
 * operação o exige (troca, financiamento, saldo posterior, venda fora do
 * estabelecimento, garantia contratual, RENAVE).
 *
 * Regras de redação, vigiadas por ./contrato-modelo.test.ts e ./contrato-aceite.test.ts:
 *  - a palavra "troca" só aparece em bloco condicional à troca — o veículo
 *    recebido é chamado de VEÍCULO EM PAGAMENTO;
 *  - os anexos são numerados na ordem em que são gerados (I, II, III…, sem
 *    buraco) e só são citados por `ref`, que falha se o anexo não existe;
 *  - cláusula que limita direito do COMPRADOR sai com `limitativa` (destaque, art. 54, § 4º, CDC);
 *  - dado ausente vira lacuna visível ("____"), nunca some da frase.
 *
 * Análise funcional do modelo; não é validação jurídica.
 */
import { formatarPreco } from "@/lib/veiculos/regras";
import { formatarDocumento, type Negociacao } from "./regras";
import type { BlocosDaOperacao } from "./retrato-da-operacao";
import { inteiroPorExtenso } from "./valor-por-extenso";

/** Item de cláusula; `limitativa` sai em negrito, dentro de caixa. */
export type ItemDoContrato = string | { texto: string; limitativa?: boolean };

export const textoDoItem = (i: ItemDoContrato) => (typeof i === "string" ? i : i.texto);
export const itemLimitativo = (i: ItemDoContrato) => typeof i !== "string" && !!i.limitativa;
const lim = (texto: string): ItemDoContrato => ({ texto, limitativa: true });

export interface SecaoDoContrato {
  titulo: string;
  itens: ItemDoContrato[];
}

export type ChaveDoAnexo =
  | "estado_veiculo"
  | "termo_entrega"
  | "termo_recebimento"
  | "indicacao_condutor"
  | "documentos_troca"
  | "termo_garantia";

export interface AnexoDoContrato {
  chave: ChaveDoAnexo;
  /** "Anexo II" */
  numero: string;
  nome: string;
}

export interface ClausulasFixas {
  /** Itens 2.x, depois da tabela de pagamento. */
  pagamento: string[];
  /** Cláusulas seguintes ao pagamento, na ordem do modelo (3ª em diante). */
  secoes: SecaoDoContrato[];
  /** Anexos impressos depois das assinaturas, já numerados. */
  anexos: AnexoDoContrato[];
}

const LACUNA = "________________";
const txt = (v?: string | number | null) =>
  v == null || String(v).trim() === "" ? LACUNA : String(v);
const data = (v?: string | null) => (v ? v.slice(0, 10).split("-").reverse().join("/") : LACUNA);
const percentual = (v?: number | null) => (v == null ? "____" : String(v).replace(".", ","));
const ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/** "30 (trinta) dias úteis"; sem número, lacuna no lugar do prazo. */
export function prazo(n: number | null | undefined, unidade = "dias"): string {
  return n == null ? `____ ${unidade}` : `${n} (${inteiroPorExtenso(n)}) ${unidade}`;
}
const diasUteis = (n: number) => `${n} (${inteiroPorExtenso(n)}) dia(s) útil(eis)`;

/** Canal efetivo; o booleano antigo ainda vale para contratos já fotografados. */
export function canalDaVenda(n: Negociacao): "presencial" | "fora_do_estabelecimento" {
  const d = n.contrato ?? {};
  return d.canal_venda ?? (d.venda_fora_do_estabelecimento ? "fora_do_estabelecimento" : "presencial");
}

/** Anexos que a venda gera, na ordem de impressão. A compra não tem anexos. */
export function anexosDaVenda(n: Negociacao, blocos: BlocosDaOperacao): AnexoDoContrato[] {
  if (n.tipo !== "venda") return [];
  const troca = blocos.troca && !!n.troca;
  const lista: [ChaveDoAnexo, string, boolean][] = [
    ["estado_veiculo", "Estado do veículo", true],
    ["termo_entrega", "Termo de entrega", true],
    ["termo_recebimento", "Termo de recebimento do VEÍCULO EM PAGAMENTO", troca],
    ["indicacao_condutor", "Indicação de condutor", true],
    ["documentos_troca", "Documentos do VEÍCULO EM PAGAMENTO", troca],
    ["termo_garantia", "Termo de Garantia Contratual", !!n.contrato?.garantia_contratual],
  ];
  return lista
    .filter(([, , entra]) => entra)
    .map(([chave, nome], i) => ({ chave, nome, numero: `Anexo ${ROMANOS[i]}` }));
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
  const anexos = anexosDaVenda(n, blocos);
  const ref = (chave: ChaveDoAnexo) => {
    const a = anexos.find((x) => x.chave === chave);
    if (!a) throw new Error(`Contrato cita anexo não gerado: ${chave}`);
    return a.numero;
  };

  const gerais: SecaoDoContrato = {
    titulo: "Disposições gerais",
    itens: [
      `Os dados pessoais das partes são tratados para a execução deste contrato, o cumprimento de obrigações legais e regulatórias (registro no Detran, obrigações fiscais) e o exercício regular de direitos, e são compartilhados apenas com órgãos de trânsito, instituições financeiras envolvidas na operação, despachante e autoridades, quando necessário. O titular pode exercer os direitos do art. 18 da Lei 13.709/2018 (LGPD) pelo e-mail ${txt(d.email_lgpd || e?.email)}.`,
      "A tolerância de uma parte com o descumprimento da outra não constitui novação nem renúncia de direito.",
      "As comunicações entre as partes serão feitas pelos endereços, telefones e e-mails indicados na qualificação, e cada parte deve informar à outra qualquer alteração.",
      "As partes declaram que leram este contrato e que tiveram as dúvidas esclarecidas.",
      `Fica eleito o foro do domicílio do COMPRADOR${foro ? ` (${foro})` : ""} para dirimir questões deste contrato (art. 101, I, do Código de Defesa do Consumidor).`,
    ],
  };

  // A compra pela loja ainda não tem modelo de aquisição (sempre minuta):
  // entra só o que vale para qualquer contrato.
  if (!venda) return { pagamento: [], secoes: [gerais], anexos };

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
  const km = n.veiculo.km == null ? LACUNA : n.veiculo.km.toLocaleString("pt-BR");
  const regularidade: SecaoDoContrato = {
    titulo: "Da regularidade do veículo",
    itens: [
      `A VENDEDORA informa, em atenção à Lei 13.111/2015 e ao art. 31 do Código de Defesa do Consumidor, o resultado da consulta realizada em ${data(d.consulta_debitos_em)}: IPVA e licenciamento: ${txt(deb.ipva_licenciamento)}; multas: ${txt(deb.multas)}; restrições: ${txt(deb.restricoes)}; leilão ou sinistro: ${txt(deb.leilao_sinistro)}; recall pendente: ${txt(deb.recall)}. Os débitos com fato gerador anterior à entrega ficam a cargo ${deb.responsavel === "comprador" ? "do COMPRADOR" : deb.responsavel === "vendedora" ? "da VENDEDORA" : `de ${LACUNA}`}.`,
      `O estado de conservação, os itens e os acessórios do veículo são os descritos no ${ref("estado_veiculo")}, conferidos pelo COMPRADOR.`,
      `${d.test_drive === "fez" ? "O COMPRADOR realizou test-drive do veículo." : d.test_drive === "dispensou" ? "O COMPRADOR optou por não realizar test-drive." : `Test-drive: ${LACUNA}.`} A avaliação prévia não exclui a garantia legal por vício oculto.`,
      `A VENDEDORA declara que a quilometragem informada na Cláusula 1ª (${km} km) corresponde à indicada no hodômetro na data deste contrato e que não tem conhecimento de adulteração.`,
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
      `O veículo será entregue em ${data(d.entrega_em)}, às ${txt(d.entrega_hora)}, mediante termo de entrega (${ref("termo_entrega")})${troca ? `; o VEÍCULO EM PAGAMENTO será recebido pela VENDEDORA em ${data(d.recebimento_troca_em)}, às ${txt(d.recebimento_troca_hora)}, mediante termo de recebimento (${ref("termo_recebimento")})` : ""}.`,
      lim("A partir da entrega, o COMPRADOR responde pela guarda, pelo uso, pelos tributos e pelas infrações relativas ao veículo."),
      ...(troca
        ? ["Até a entrega do VEÍCULO EM PAGAMENTO, o COMPRADOR responde por ele; a partir do recebimento, a VENDEDORA."]
        : []),
      `Infração cometida entre a entrega e a transferência de propriedade terá o condutor indicado nos termos do art. 257, § 7º, do Código de Trânsito Brasileiro e da Resolução CONTRAN 918/2022, com o formulário do ${ref("indicacao_condutor")}; a parte notificada avisa a outra em até 5 (cinco) dias.`,
      "A parte que pagar multa ou débito de responsabilidade da outra será reembolsada em até 10 (dez) dias do aviso, com o comprovante.",
      "A responsabilidade penal por fato ocorrido na condução do veículo é pessoal de quem o conduzia.",
    ],
  };

  // Sem escolha explícita, venda com parcelas à loja conta da quitação; à vista, da assinatura.
  // Com financiamento, conta sempre da assinatura (o banco paga na liberação).
  const contaDeEfetivo = blocos.financiamento_bancario
    ? "assinatura"
    : (d.transferencia_conta_de ?? (blocos.parcelas_a_loja ? "quitacao" : "assinatura"));
  const contaDe = contaDeEfetivo === "quitacao" ? "da quitação do preço" : "da assinatura";
  const gravame = blocos.financiamento_bancario
    ? `O veículo será transferido com o gravame da instituição financeira${bancos ? ` (${bancos})` : ""}. `
    : "";
  const quemPagaTaxas =
    d.transferencia_taxas_por === "vendedora"
      ? "pela VENDEDORA"
      : d.transferencia_taxas_por === "comprador"
        ? "pelo COMPRADOR"
        : `por ${LACUNA}`;
  const taxas = lim(
    `As taxas de transferência serão pagas ${quemPagaTaxas}.${d.despachante_cents ? ` O serviço de despachante, contratado pelo COMPRADOR, custa ${preco(d.despachante_cents)} e não integra o preço.` : ""}`,
  );
  const registrar =
    "O COMPRADOR registrará a transferência em até 30 (trinta) dias da emissão da ATPV-e (art. 123, § 1º, e art. 233 do Código de Trânsito Brasileiro).";
  const transferencia: SecaoDoContrato = {
    titulo: "Da transferência",
    itens: [
      ...(d.usa_renave
        ? [
            `${gravame}A saída do veículo do estoque da VENDEDORA será registrada no RENAVE em até ${diasUteis(d.prazo_renave_dias ?? 1)} ${contaDe}, gerando a ATPV-e com a observação "Documento gerado pelo RENAVE", que será enviada ao COMPRADOR pelo e-mail indicado na qualificação.`,
            "O registro da saída no RENAVE torna o COMPRADOR responsável pelo veículo perante o órgão de trânsito (Comunicação Renave).",
            registrar,
          ]
        : [
            `${gravame}A VENDEDORA emitirá a ATPV-e (Resolução CONTRAN 809/2020) em até ${diasUteis(d.prazo_atpve_dias ?? 5)} ${contaDe}.`,
            registrar,
            "Não realizada a transferência no prazo do item 5.2, a VENDEDORA encaminhará ao Detran o comprovante de transferência em até 60 (sessenta) dias (art. 134 do Código de Trânsito Brasileiro).",
          ]),
      taxas,
      ...(troca
        ? [
            `O COMPRADOR emitirá a ATPV-e do VEÍCULO EM PAGAMENTO em favor da VENDEDORA em até 5 (cinco) dias úteis do recebimento, pelo gov.br ou no Detran, com os documentos do ${ref("documentos_troca")}.`,
          ]
        : []),
    ],
  };

  const gc = d.garantia_contratual;
  const garantia: SecaoDoContrato = {
    titulo: "Da garantia",
    itens: [
      `A VENDEDORA responde pelos vícios do veículo nos termos dos arts. 18, 24 e 25 do Código de Defesa do Consumidor, sendo nula cláusula que exonere ou atenue essa responsabilidade (art. 51, I). O prazo para reclamar é de 90 (noventa) dias (art. 26, II), contado da entrega ou, para vício oculto, de quando ele se manifestar (art. 26, §§ 1º e 3º).${gc ? " Por ser a garantia contratual complementar à legal (art. 50), o prazo legal começa a correr após o término da garantia contratual." : ""}`,
      "A reclamação comprovadamente formulada pelo COMPRADOR obsta a decadência até a resposta negativa da VENDEDORA, transmitida de forma inequívoca (art. 26, § 2º, I). Não sanado o vício em 30 (trinta) dias (art. 18, § 1º), o COMPRADOR pode exigir, à sua escolha: (a) a substituição do veículo por outro equivalente, em perfeitas condições de uso; (b) a restituição imediata da quantia paga, monetariamente atualizada, sem prejuízo de eventuais perdas e danos; ou (c) o abatimento proporcional do preço. O COMPRADOR poderá fazer uso imediato dessas alternativas sempre que, em razão da extensão do vício, a substituição das partes viciadas puder comprometer a qualidade ou as características do veículo ou diminuir-lhe o valor (art. 18, § 3º).",
      lim(
        "Não é vício o desgaste natural de peças compatível com a idade e a quilometragem informadas, nem o dano causado por uso inadequado, acidente ou intervenção de terceiros depois da entrega.",
      ),
      ...(gc
        ? [
            `A VENDEDORA concede, além da garantia legal, garantia contratual (art. 50 do Código de Defesa do Consumidor) de ${txt(gc.prazo)}, cobrindo ${txt(gc.componentes)}, nas condições do ${ref("termo_garantia")} (Termo de Garantia Contratual), que integra este contrato.`,
          ]
        : []),
      `A avaliação do vício será feita em ${txt(cidadeLoja)}, e a remoção do veículo até lá, quando ele não puder rodar, fica a cargo da VENDEDORA.`,
    ],
  };

  const inadimplemento: SecaoDoContrato = {
    titulo: "Do inadimplemento",
    itens: [
      "O atraso no pagamento que persista por 15 (quinze) dias depois de notificação permite à parte prejudicada exigir o cumprimento ou resolver o contrato (art. 475 do Código Civil).",
      ...(blocos.saldo_posterior
        ? [
            lim(
              `Resolvido o contrato por culpa do COMPRADOR, a VENDEDORA restituirá as quantias recebidas, monetariamente atualizadas, podendo reter somente: (a) as despesas administrativas comprovadas; (b) o valor dos danos ao veículo, apurados em vistoria na devolução; e (c) indenização pela fruição de ${percentual(d.taxa_fruicao ?? d.retencao_percentual_mes)}% ao mês sobre o valor do veículo informado na Cláusula 1ª, proporcional aos dias em que o veículo esteve com o COMPRADOR. É vedada a perda total das parcelas pagas (art. 53 do Código de Defesa do Consumidor).`,
            ),
          ]
        : []),
      `Descumprindo a VENDEDORA a entrega ou a transferência, o COMPRADOR pode exigir o cumprimento ou resolver o contrato, com restituição integral e imediata do que pagou, monetariamente atualizado, sem prejuízo de perdas e danos${troca && blocos.quitacao_da_troca ? ", e a VENDEDORA responde pela quitação do gravame do VEÍCULO EM PAGAMENTO que assumiu" : ""} (art. 475 do Código Civil).`,
      ...(canalDaVenda(n) === "fora_do_estabelecimento"
        ? [
            "Tendo a contratação ocorrido fora do estabelecimento comercial, o COMPRADOR pode desistir do contrato em até 7 (sete) dias contados da assinatura ou do recebimento do veículo, com a devolução imediata dos valores pagos, monetariamente atualizados (art. 49 do Código de Defesa do Consumidor).",
          ]
        : []),
      ...(blocos.financiamento_bancario
        ? [
            `Não liberado o financiamento em ${prazo(d.financiamento_prazo_dias)}, o COMPRADOR terá 5 (cinco) dias úteis para pagar o saldo por outro meio; não o fazendo, o contrato se desfaz e os valores pagos são restituídos em até 10 (dez) dias.`,
          ]
        : []),
    ],
  };

  const secaoAnexos: SecaoDoContrato = {
    titulo: "Dos anexos e da assinatura",
    itens: [
      `Integram este contrato, impressos após as assinaturas: ${anexos.map((a) => `${a.numero} (${a.nome})`).join(", ")}.`,
      "Este contrato pode ser assinado em papel ou eletronicamente (MP 2.200-2/2001, art. 10, § 2º); na assinatura eletrônica, dispensam-se as testemunhas (art. 784, § 4º, do Código de Processo Civil).",
    ],
  };

  return {
    pagamento,
    secoes: [regularidade, entrega, transferencia, garantia, inadimplemento, gerais, secaoAnexos],
    anexos,
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
