/**
 * RETRATO DA OPERAÇÃO — a leitura única que os documentos da venda consomem.
 *
 * Não é um cadastro novo: deriva tudo da negociação já gravada (fotografias de
 * cliente, veículo, troca, pagamentos e `contrato`, ver ./regras.ts e
 * ./modelo-contrato.ts). Nenhum gerador de documento recalcula saldo, decide se
 * há troca ou inventa um evento por conta própria: lê daqui.
 *
 * Separa quatro coisas que o PDV ainda guarda juntas:
 *  - FECHAMENTO: a negociação concluída (`concluida_em`);
 *  - ENTREGA do vendido e RECEBIMENTO da troca: hoje só existe a data PREVISTA
 *    digitada no contrato. Nenhuma entrega é afirmada como acontecida;
 *  - PAGAMENTOS: são condições PREVISTAS. O financeiro atual baixa na conclusão
 *    os pagamentos que não são crediário, inclusive financiamento e cheque, então
 *    não serve de prova de recebimento; quitação fica "não rastreada".
 *
 * Pendências trazem `onde` para a tela levar direto ao campo que falta. Textos em
 * português; quem mostra traduz.
 */
import { PRAZO_DA_GARANTIA } from "./modelo-contrato";
import {
  pendenciasDaPessoaFiscal,
  pendenciasDoVeiculoFiscal,
  pessoaFiscal,
  veiculoFiscalDaTroca,
} from "@/lib/fiscal/rascunho";
import {
  documentoValido,
  resumoDaNegociacao,
  soDigitos,
  type FormaDePagamento,
  type Negociacao,
  type TrocaDaNegociacao,
  type VeiculoDaNegociacao,
} from "./regras";

export type CenarioDaOperacao = "venda_simples" | "venda_com_troca" | "compra_direta";

/** Onde se resolve a pendência — a tela usa para abrir o lugar certo. */
export type LugarDaPendencia =
  "empresa" | "cliente" | "veiculo" | "troca" | "pagamentos" | "contrato";

/**
 * Setor do PDV onde o campo é preenchido. É o agrupamento que a tela mostra
 * ("Comprador › Informe a profissão do cliente.").
 */
export type SetorDoPdv =
  | "Loja"
  | "Comprador"
  | "Veículo"
  | "Troca"
  | "Pagamento"
  | "Entrega e transferência"
  | "Contrato";

export interface PendenciaDoDocumento {
  onde: LugarDaPendencia;
  setor: SetorDoPdv;
  /** Campo da fotografia, quando há um campo só a preencher. */
  campo?: string;
  /**
   * `bloqueia`: impede a versão para assinatura.
   * `aviso`: sai em branco ou pede revisão; também impede a versão para
   *   assinatura (o contrato sai como minuta), mas não trava a negociação.
   */
  gravidade: "bloqueia" | "aviso";
  mensagem: string;
}

/** Formas que deixam parcela a receber pela própria loja. */
const PARCELAS_A_LOJA: readonly FormaDePagamento[] = [
  "promissoria",
  "crediario",
  "boleto",
  "cheque",
];

export interface BlocosDaOperacao {
  troca: boolean;
  /** A loja assume quitar o financiamento do veículo da troca. */
  quitacao_da_troca: boolean;
  desconto: boolean;
  financiamento_bancario: boolean;
  consorcio: boolean;
  cartao: boolean;
  /** Promissória, crediário, boleto ou cheque: a loja recebe depois. */
  parcelas_a_loja: boolean;
  /** Algum valor fica para depois da assinatura: parcelas, financiamento, consórcio ou data futura. */
  saldo_posterior: boolean;
}

export interface ValoresDaOperacao {
  preco_cents: number;
  desconto_cents: number;
  avaliacao_troca_cents: number;
  quitacao_troca_cents: number;
  /** preço − avaliação bruta da troca + quitação assumida − desconto. */
  saldo_a_pagar_cents: number;
  pagamentos_previstos_cents: number;
  /** saldo_a_pagar − pagamentos previstos. Zero = conciliado. */
  diferenca_cents: number;
  conciliado: boolean;
}

export interface EventoPrevisto {
  /** Data prevista digitada no contrato (AAAA-MM-DD ou texto), ou null. */
  prevista: string | null;
  /** Nenhum evento real é registrado ainda: entrega e recebimento são etapas futuras. */
  situacao: "previsto" | "nao_informado";
}

export interface EventosDaOperacao {
  fechamento: { concluida_em: string | null };
  entrega_do_vendido: EventoPrevisto;
  /** Só com troca. */
  recebimento_da_troca: EventoPrevisto | null;
  /** O financeiro atual não distingue previsto de recebido para todas as formas. */
  quitacao: { situacao: "nao_rastreada" };
}

export interface RetratoDaOperacao {
  negociacao_id: string;
  numero: number;
  cenario: CenarioDaOperacao;
  comprador: "pessoa_fisica" | "pessoa_juridica" | "indefinido";
  blocos: BlocosDaOperacao;
  valores: ValoresDaOperacao;
  eventos: EventosDaOperacao;
  pendencias: PendenciaDoDocumento[];
}

const vazio = (v: unknown) => v == null || String(v).trim() === "";

function evento(prevista: string | null | undefined): EventoPrevisto {
  return vazio(prevista)
    ? { prevista: null, situacao: "nao_informado" }
    : { prevista: String(prevista).trim(), situacao: "previsto" };
}

function mesmoVeiculo(
  n: Pick<Negociacao, "veiculo_id" | "troca_veiculo_id">,
  a: VeiculoDaNegociacao,
  b: TrocaDaNegociacao,
): boolean {
  if (n.veiculo_id && n.troca_veiculo_id && n.veiculo_id === n.troca_veiculo_id) return true;
  const chave = (v?: string | null) => (v ?? "").replace(/[^0-9a-z]/gi, "").toUpperCase();
  for (const campo of ["chassi", "placa", "renavam"] as const) {
    const x = chave(a[campo]);
    if (x && x === chave(b[campo])) return true;
  }
  return false;
}

/** Campos de `contrato` que a tela mostra no setor de entrega e transferência. */
const CAMPOS_DE_ENTREGA = new Set([
  "entrega_em",
  "entrega_hora",
  "recebimento_troca_em",
  "recebimento_troca_hora",
  "entrega_km",
  "entrega_chaves",
  "recebimento_troca_km",
  "recebimento_troca_chaves",
  "transferencia_taxas_por",
  "transferencia_conta_de",
  "despachante_cents",
]);

export function setorDaPendencia(onde: LugarDaPendencia, campo?: string): SetorDoPdv {
  switch (onde) {
    case "empresa":
      return "Loja";
    case "cliente":
      return "Comprador";
    case "veiculo":
      return "Veículo";
    case "troca":
      return "Troca";
    case "pagamentos":
      return "Pagamento";
    case "contrato":
      if (campo === "recebimento_troca_em" || campo === "recebimento_troca_hora") return "Troca";
      return campo && CAMPOS_DE_ENTREGA.has(campo) ? "Entrega e transferência" : "Contrato";
  }
}

type Falta = Omit<PendenciaDoDocumento, "setor">;

function exigir(
  faltas: Falta[],
  onde: LugarDaPendencia,
  fonte: object,
  campos: Record<string, string>,
  gravidade: PendenciaDoDocumento["gravidade"] = "bloqueia",
) {
  for (const [campo, rotulo] of Object.entries(campos))
    if (vazio((fonte as Record<string, unknown>)[campo]))
      faltas.push({ onde, campo, gravidade, mensagem: `Informe ${rotulo}.` });
}

export function retratoDaOperacao(n: Negociacao): RetratoDaOperacao {
  const venda = n.tipo === "venda";
  const troca = venda ? n.troca : null;
  const formas = new Set(n.pagamentos.filter((p) => p.valor_cents > 0).map((p) => p.forma));
  const digitos = soDigitos(n.cliente.documento).length;
  const comprador =
    digitos === 11 ? "pessoa_fisica" : digitos === 14 ? "pessoa_juridica" : "indefinido";

  const resumo = resumoDaNegociacao(n);
  const avaliacao = troca?.valor_cents ?? 0;
  const quitacao = troca?.quitacao_cents ?? 0;
  // preço − desconto − (avaliação bruta − quitação assumida): a mesma conta do
  // resumo do PDV, para o contrato nunca divergir da tela nem do financeiro.
  const saldo = resumo.total_cents - resumo.troca_liquida_cents;

  const blocos: BlocosDaOperacao = {
    troca: !!troca,
    quitacao_da_troca: quitacao > 0,
    desconto: venda && (n.desconto_cents ?? 0) > 0,
    financiamento_bancario: formas.has("financiamento"),
    consorcio: formas.has("consorcio"),
    cartao: formas.has("cartao_credito") || formas.has("cartao_debito"),
    parcelas_a_loja: PARCELAS_A_LOJA.some((f) => formas.has(f)),
    saldo_posterior: false,
  };
  const assinatura = (n.contrato?.assinatura_em ?? "").slice(0, 10);
  blocos.saldo_posterior =
    venda &&
    (blocos.parcelas_a_loja ||
      blocos.financiamento_bancario ||
      blocos.consorcio ||
      n.pagamentos.some(
        (p) =>
          p.valor_cents > 0 &&
          [p.data_pagamento, p.primeiro_vencimento].some((d) => !!d && !!assinatura && d.slice(0, 10) > assinatura),
      ));

  const faltas: Falta[] = [];
  const contrato = n.contrato ?? null;

  if (!venda)
    faltas.push({
      onde: "contrato",
      gravidade: "bloqueia",
      mensagem:
        "O modelo atual é de venda da loja ao cliente; compra pela loja exige um contrato de aquisição próprio.",
    });

  // Empresa: a fotografia do contrato, nunca o cadastro de hoje.
  const empresa = contrato?.empresa;
  if (!empresa)
    faltas.push({
      onde: "contrato",
      gravidade: "bloqueia",
      mensagem: "Negociação sem os dados do contrato da loja. Revise os dados do contrato.",
    });
  else {
    exigir(faltas, "empresa", empresa, {
      razao_social: "a razão social da loja",
      endereco: "o endereço da loja",
      numero: "o número do endereço da loja",
      cidade: "a cidade da loja",
      uf: "a UF da loja",
    });
    if (!documentoValido(empresa.cnpj) || soDigitos(empresa.cnpj).length !== 14)
      faltas.push({
        onde: "empresa",
        campo: "cnpj",
        gravidade: "bloqueia",
        mensagem: "Informe um CNPJ válido da loja.",
      });
    exigir(
      faltas,
      "empresa",
      empresa,
      { telefone: "o telefone da loja", email: "o e-mail da loja" },
      "aviso",
    );
  }

  // Comprador: a qualificação que o modelo imprime.
  const c = n.cliente;
  exigir(faltas, "cliente", c, { nome: "o nome do cliente" });
  if (!documentoValido(c.documento))
    faltas.push({
      onde: "cliente",
      campo: "documento",
      gravidade: "bloqueia",
      mensagem: "Informe um CPF ou CNPJ válido do cliente.",
    });
  exigir(faltas, "cliente", c, {
    endereco: "o endereço do cliente",
    numero: "o número do endereço do cliente",
    bairro: "o bairro do cliente",
    cidade: "a cidade do cliente",
    uf: "a UF do cliente",
    cep: "o CEP do cliente",
  });
  if (comprador === "pessoa_fisica") {
    exigir(faltas, "cliente", c, {
      nacionalidade: "a nacionalidade do cliente",
      estado_civil: "o estado civil do cliente",
      profissao: "a profissão do cliente",
      rg: "o RG do cliente",
    });
    // Órgão e UF só se pedem depois do número: sem RG a falta é uma só.
    if (!vazio(c.rg))
      exigir(faltas, "cliente", c, {
        rg_orgao_expedidor: "o órgão expedidor do RG do cliente",
        rg_uf: "a UF do RG do cliente",
      });
  }
  if (comprador === "pessoa_juridica")
    faltas.push({
      onde: "cliente",
      gravidade: "aviso",
      mensagem:
        "O modelo atual qualifica o comprador como pessoa física (nacionalidade, RG, nascimento); comprador com CNPJ exige revisão do texto.",
    });
  exigir(
    faltas,
    "cliente",
    c,
    {
      telefone: "o telefone do cliente",
      email: "o e-mail do cliente",
      ...(comprador === "pessoa_fisica" ? { nascimento: "a data de nascimento do cliente" } : {}),
      // Anexo de indicação do condutor: sem CNH sai em branco (o condutor pode ser outro).
      ...(venda && comprador === "pessoa_fisica" ? { cnh: "a CNH do cliente (indicação de condutor)" } : {}),
    },
    "aviso",
  );

  // Veículo vendido.
  const v = n.veiculo;
  if (venda && !n.veiculo_id)
    faltas.push({
      onde: "veiculo",
      campo: "veiculo_id",
      gravidade: "bloqueia",
      mensagem: "Escolha o veículo do estoque.",
    });
  exigir(faltas, "veiculo", v, {
    marca: "a marca do veículo",
    modelo: "o modelo do veículo",
    ano_fabricacao: "o ano de fabricação do veículo",
    ano_modelo: "o ano do modelo do veículo",
    chassi: "o chassi do veículo",
    condicao: "se o veículo é novo ou usado",
  });
  if (v.condicao !== "novo")
    exigir(faltas, "veiculo", v, {
      placa: "a placa do veículo",
      renavam: "o Renavam do veículo",
    });
  exigir(
    faltas,
    "veiculo",
    v,
    { cor: "a cor do veículo", km: "a quilometragem do veículo" },
    "aviso",
  );
  if (!v.regularizacao?.length)
    faltas.push({
      onde: "veiculo",
      campo: "regularizacao",
      gravidade: "aviso",
      mensagem: 'Situação de débitos do veículo não informada; o contrato imprime "Não informado".',
    });

  // Veículo recebido na troca.
  if (troca) {
    exigir(faltas, "troca", troca, {
      marca: "a marca do veículo da troca",
      modelo: "o modelo do veículo da troca",
      ano_fabricacao: "o ano de fabricação do veículo da troca",
      ano_modelo: "o ano do modelo do veículo da troca",
      placa: "a placa do veículo da troca",
      chassi: "o chassi do veículo da troca",
      renavam: "o Renavam do veículo da troca",
    });
    if (avaliacao <= 0)
      faltas.push({
        onde: "troca",
        campo: "valor_cents",
        gravidade: "bloqueia",
        mensagem: "Informe a avaliação do veículo da troca.",
      });
    if (mesmoVeiculo(n, v, troca))
      faltas.push({
        onde: "troca",
        gravidade: "bloqueia",
        mensagem: "O veículo da troca não pode ser o mesmo veículo vendido.",
      });
    if (quitacao > 0)
      exigir(faltas, "troca", troca, {
        gravame_credor: "o credor do financiamento do veículo da troca",
      });
    if (quitacao > 0 && !troca.regularizacao?.some((r) => r.responsavel === "loja"))
      faltas.push({
        onde: "troca",
        campo: "regularizacao",
        gravidade: "aviso",
        mensagem:
          "Há quitação de financiamento da troca; registre o gravame na situação de débitos.",
      });
  }

  // Pagamentos: condições previstas, conciliadas com o saldo.
  const diferenca = saldo - resumo.pagamentos_cents;
  if (diferenca !== 0)
    faltas.push({
      onde: "pagamentos",
      gravidade: "bloqueia",
      mensagem:
        diferenca > 0 ? "Os pagamentos não cobrem o saldo." : "Os pagamentos passam do saldo.",
    });
  if (!n.pagamentos.some((p) => p.valor_cents > 0) && saldo > 0)
    faltas.push({
      onde: "pagamentos",
      gravidade: "bloqueia",
      mensagem: "Informe a forma de pagamento do saldo.",
    });
  for (const p of n.pagamentos) {
    if (p.valor_cents <= 0) continue;
    if ((p.forma === "financiamento" || p.forma === "consorcio") && vazio(p.banco))
      faltas.push({
        onde: "pagamentos",
        campo: "banco",
        gravidade: "bloqueia",
        mensagem: "Informe o banco ou administradora do financiamento/consórcio.",
      });
    if (
      PARCELAS_A_LOJA.includes(p.forma) &&
      vazio(p.primeiro_vencimento) &&
      vazio(p.data_pagamento)
    )
      faltas.push({
        onde: "pagamentos",
        campo: "primeiro_vencimento",
        gravidade: "bloqueia",
        mensagem: "Informe o vencimento do pagamento a prazo à loja.",
      });
    if ((p.forma === "cartao_credito" || p.forma === "cartao_debito") && vazio(p.bandeira))
      faltas.push({
        onde: "pagamentos",
        campo: "bandeira",
        gravidade: "aviso",
        mensagem: "Bandeira do cartão não informada; o contrato imprime em branco.",
      });
  }

  // Dados próprios do contrato.
  if (contrato) {
    exigir(faltas, "contrato", contrato, {
      local: "o local do contrato",
      entrega_em: "a data prevista de entrega do veículo",
    });
    if (troca)
      exigir(faltas, "contrato", contrato, {
        recebimento_troca_em: "a data prevista de recebimento do veículo da troca",
      });
    if (venda)
      exigir(faltas, "contrato", contrato, {
        transferencia_taxas_por: "quem paga as taxas de transferência",
      });
    // Termos de entrega e de recebimento: km e chaves no ato (km cai na do cadastro).
    exigir(faltas, "contrato", contrato, { entrega_chaves: "o número de chaves entregues" });
    if (vazio(contrato.entrega_km) && vazio(v.km))
      exigir(faltas, "contrato", contrato, { entrega_km: "a quilometragem na entrega" });
    if (troca) {
      exigir(faltas, "contrato", contrato, {
        recebimento_troca_chaves: "o número de chaves recebidas com o veículo da troca",
      });
      if (vazio(contrato.recebimento_troca_km) && vazio(troca.km))
        exigir(faltas, "contrato", contrato, {
          recebimento_troca_km: "a quilometragem do veículo da troca no recebimento",
        });
    }
    // Anexo do estado do veículo: conferido na assinatura.
    const estado = contrato.estado_veiculo ?? {};
    for (const [k, rotulo] of [
      ["lataria", "o estado da lataria e pintura"],
      ["interior", "o estado do interior"],
      ["pneus", "o estado dos pneus"],
      ["itens", "os itens e acessórios do veículo"],
    ] as const)
      if (vazio(estado[k]))
        faltas.push({
          onde: "contrato",
          campo: `estado_veiculo.${k}`,
          gravidade: "bloqueia",
          mensagem: `Informe ${rotulo}.`,
        });
    // Termo de garantia: só existe com garantia contratual, e então nada sai em branco.
    const g = contrato.garantia_contratual;
    if (g) {
      if (!PRAZO_DA_GARANTIA.test(g.prazo ?? ""))
        faltas.push({
          onde: "contrato",
          campo: "garantia_contratual.prazo",
          gravidade: "bloqueia",
          mensagem: "Informe o prazo da garantia com número e unidade (ex.: 3 meses).",
        });
      if (vazio(g.componentes))
        faltas.push({
          onde: "contrato",
          campo: "garantia_contratual.componentes",
          gravidade: "bloqueia",
          mensagem: "Informe os componentes cobertos pela garantia.",
        });
      if (vazio(contrato.empresa?.telefone) && vazio(contrato.empresa?.email))
        faltas.push({
          onde: "empresa",
          campo: "telefone",
          gravidade: "bloqueia",
          mensagem: "Informe o telefone ou o e-mail da loja: é o contato para acionar a garantia.",
        });
    }
    if (blocos.quitacao_da_troca)
      exigir(faltas, "contrato", contrato, {
        quitacao_troca_prazo_dias: "o prazo para a loja quitar o financiamento da troca",
      });
    if (blocos.financiamento_bancario)
      exigir(faltas, "contrato", contrato, {
        financiamento_prazo_dias: "o prazo para a liberação do financiamento",
      });
    exigir(
      faltas,
      "contrato",
      contrato,
      {
        representante_nome: "o representante legal da loja",
        representante_cpf: "o CPF do representante legal da loja",
        consulta_debitos_em: "a data da consulta de débitos no Detran",
        test_drive: "se o comprador fez o test-drive",
        entrega_hora: "o horário da entrega do veículo",
        ...(troca ? { recebimento_troca_hora: "o horário do recebimento do veículo da troca" } : {}),
        // A cláusula 7.2 (fruição) só existe quando há saldo depois da assinatura.
        ...(blocos.saldo_posterior ? { taxa_fruicao: "a taxa de fruição mensal (configuração da loja)" } : {}),
      },
      "aviso",
    );
  }

  return {
    negociacao_id: n.id,
    numero: n.numero,
    cenario: !venda ? "compra_direta" : troca ? "venda_com_troca" : "venda_simples",
    comprador,
    blocos,
    valores: {
      preco_cents: n.valor_cents,
      desconto_cents: venda ? (n.desconto_cents ?? 0) : 0,
      avaliacao_troca_cents: avaliacao,
      quitacao_troca_cents: quitacao,
      saldo_a_pagar_cents: saldo,
      pagamentos_previstos_cents: resumo.pagamentos_cents,
      diferenca_cents: diferenca,
      conciliado: diferenca === 0,
    },
    eventos: {
      fechamento: { concluida_em: n.concluida_em },
      entrega_do_vendido: evento(contrato?.entrega_em),
      recebimento_da_troca: troca ? evento(contrato?.recebimento_troca_em) : null,
      quitacao: { situacao: "nao_rastreada" },
    },
    pendencias: faltas.map((f) => ({ ...f, setor: setorDaPendencia(f.onde, f.campo) })),
  };
}

/** O que falta, como a tela mostra: setor, campo e mensagem. */
export interface FaltaParaConcluir {
  setor: SetorDoPdv;
  /** Lugar e campo, para a tela focar o campo (ex.: "cliente.profissao"). */
  onde: LugarDaPendencia;
  campo?: string;
  mensagem: string;
}

/**
 * Tudo que impede concluir, organizado por setor. Na venda soma as regras de
 * caixa do PDV (`pendenciasParaConcluir`) aos dados obrigatórios do contrato; na
 * compra o modelo de venda não se aplica, e valem só as regras de caixa.
 */
export function faltandoParaConcluir(
  n: Negociacao,
  pendenciasDeCaixa: readonly string[],
): FaltaParaConcluir[] {
  const out: FaltaParaConcluir[] = [];
  const vistas = new Set<string>();
  const add = (f: FaltaParaConcluir) => {
    if (vistas.has(f.mensagem)) return;
    vistas.add(f.mensagem);
    out.push(f);
  };
  if (n.tipo === "venda")
    for (const p of retratoDaOperacao(n).pendencias)
      if (p.gravidade === "bloqueia")
        add({ setor: p.setor, onde: p.onde, ...(p.campo ? { campo: p.campo } : {}), mensagem: p.mensagem });
  if (n.tipo === "venda" && n.troca) {
    const troca = n.troca;
    const jaPendente = (onde: LugarDaPendencia, campo: string) =>
      out.some((f) => f.onde === onde && f.campo === campo);
    for (const f of pendenciasDaPessoaFiscal(pessoaFiscal(troca.remetente ?? n.cliente), true)) {
      const campo = f.campo === "logradouro" ? "endereco" : f.campo === "municipio" ? "cidade" : f.campo;
      if (troca.remetente || !jaPendente("cliente", campo))
        add({ setor: "Troca", onde: "troca", campo: `remetente.${campo}`, mensagem: f.mensagem });
    }
    const veiculo = veiculoFiscalDaTroca(troca, n.contrato?.recebimento_troca_km);
    for (const f of pendenciasDoVeiculoFiscal(veiculo)) {
      if (f.campo === "km" && jaPendente("contrato", "recebimento_troca_km")) continue;
      if (!jaPendente("troca", f.campo))
        add({ setor: "Troca", onde: "troca", ...f });
    }
  }
  for (const m of pendenciasDeCaixa) add({ ...lugarDaPendenciaDeCaixa(m), mensagem: m });
  return out;
}

/** As mensagens de `pendenciasParaConcluir` são fixas; o lugar sai delas. */
function lugarDaPendenciaDeCaixa(m: string): Omit<FaltaParaConcluir, "mensagem"> {
  if (/do cliente/.test(m))
    return { setor: "Comprador", onde: "cliente", campo: /nome/.test(m) ? "nome" : "documento" };
  if (/da troca/.test(m)) return { setor: "Troca", onde: "troca", campo: "modelo" };
  if (/veículo/.test(m)) return { setor: "Veículo", onde: "veiculo", campo: /estoque/.test(m) ? "veiculo_id" : "modelo" };
  if (/preço|valor da compra/.test(m)) return { setor: "Veículo", onde: "veiculo", campo: "valor_cents" };
  return { setor: "Pagamento", onde: "pagamentos" };
}
