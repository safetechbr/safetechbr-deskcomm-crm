import type { LojaDoContrato } from "./contrato";
import type { LancamentoDaVenda } from "./recibo-pagamento";
import type { FormaDePagamento, Negociacao } from "./regras";

/**
 * Nota promissória do PDV: uma por parcela que o cliente paga direto à loja.
 * Só promissória e crediário geram nota; boleto e cheque já são o título da
 * parcela. Antes da conclusão as parcelas saem do plano de pagamento, com a
 * mesma divisão do gatilho fn_pdv_gerar_crediario (migration 9045); depois,
 * dos lançamentos de financial_entries.
 */
export const FORMAS_COM_PROMISSORIA: readonly FormaDePagamento[] = ["promissoria", "crediario"];

export interface NotaPromissoria {
  /** 1..total, na ordem de vencimento. */
  numero: number;
  total: number;
  forma: FormaDePagamento;
  valor_cents: number;
  /** AAAA-MM-DD. */
  vencimento: string | null;
  /** Lançamento pago: a nota sai com a quitação no verso. */
  paga_em: string | null;
}

const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Soma meses como o Postgres (`date + interval 'n months'`): dia 31 cai no último dia do mês. */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

const somarDias = (iso: string, dias: number) => {
  const t = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + dias);
  return t.toISOString().slice(0, 10);
};

type Parcela = Omit<NotaPromissoria, "numero" | "total">;

/** Parcelas previstas no plano, divididas como o gatilho da conclusão divide. */
export function parcelasDoPlano(n: Negociacao): Parcela[] {
  const parcelas: Parcela[] = [];
  for (const p of n.pagamentos) {
    if (!FORMAS_COM_PROMISSORIA.includes(p.forma) || p.valor_cents <= 0) continue;
    const crediario = p.forma === "crediario";
    const total = crediario ? Math.round(p.valor_cents * (1 + (p.juros_bps ?? 0) / 10000)) : p.valor_cents;
    let qtd = Math.min(Math.max(p.parcelas ?? 1, 1), 120);
    if (total < qtd) qtd = 1;
    const inicio = (crediario ? p.primeiro_vencimento : p.primeiro_vencimento || p.data_pagamento) || null;
    const passo = crediario ? 0 : (p.intervalo_dias ?? 0);
    const base = Math.floor(total / qtd);
    for (let i = 1; i <= qtd; i++) {
      const venc = inicio ?? (crediario ? null : hoje());
      parcelas.push({
        forma: p.forma,
        valor_cents: base + (i <= total % qtd ? 1 : 0),
        vencimento: venc && (passo > 0 ? somarDias(venc, passo * (i - 1)) : somarMeses(venc, i - 1)),
        paga_em: null,
      });
    }
  }
  return parcelas;
}

/**
 * Notas da negociação. Com lançamentos de promissória/crediário (venda
 * concluída), valem eles; sem eles, o plano. A ordem é a do vencimento.
 */
export function notasPromissorias(n: Negociacao, lancamentos: LancamentoDaVenda[] = []): NotaPromissoria[] {
  const doBanco = lancamentos.filter((l) => FORMAS_COM_PROMISSORIA.includes(l.forma_pagamento as FormaDePagamento));
  const parcelas: Parcela[] = doBanco.length
    ? doBanco.map((l) => ({
        forma: l.forma_pagamento as FormaDePagamento,
        valor_cents: l.amount_cents,
        vencimento: l.due_date?.slice(0, 10) ?? null,
        paga_em: l.status === "paid" ? l.paid_at : null,
      }))
    : parcelasDoPlano(n);
  // sort é estável: parcelas com o mesmo vencimento mantêm a ordem do plano.
  const ordenadas = [...parcelas].sort((a, b) => (a.vencimento ?? "9999").localeCompare(b.vencimento ?? "9999"));
  return ordenadas.map((p, i) => ({ ...p, numero: i + 1, total: ordenadas.length }));
}

export interface FaltaNaNota {
  campo: string;
  mensagem: string;
}

const vazio = (v: unknown) => v == null || String(v).trim() === "";

/**
 * O que impede emitir a nota. Título de crédito não sai com campo em branco
 * (LUG art. 75): falta qualquer requisito, a nota fica bloqueada.
 */
export function faltasDaNota(n: Negociacao, loja?: Pick<LojaDoContrato, "razaoSocial" | "cnpj" | "cidade">): FaltaNaNota[] {
  const faltas: FaltaNaNota[] = [];
  const c = n.cliente;
  const e = n.contrato?.empresa;
  const exigir = (campo: string, valor: unknown, rotulo: string) => {
    if (vazio(valor)) faltas.push({ campo, mensagem: `Informe ${rotulo} (nota promissória).` });
  };
  exigir("cliente.nome", c.nome, "o nome do cliente (emitente)");
  exigir("cliente.documento", c.documento, "o CPF/CNPJ do cliente");
  exigir("cliente.endereco", c.endereco, "o endereço do cliente");
  exigir("cliente.cidade", c.cidade && c.uf ? c.cidade : null, "a cidade e UF do cliente");
  exigir("empresa.razao_social", loja?.razaoSocial ?? e?.razao_social, "a razão social da loja (beneficiária)");
  exigir("empresa.cnpj", loja?.cnpj ?? e?.cnpj, "o CNPJ da loja");
  exigir("contrato.local", n.contrato?.local || loja?.cidade || e?.cidade, "o local de pagamento (cidade da loja)");
  if (notasPromissorias(n).some((p) => !p.vencimento))
    faltas.push({ campo: "pagamentos.primeiro_vencimento", mensagem: "Informe o primeiro vencimento do crediário." });
  return faltas;
}

/** A negociação gera nota promissória? (venda com promissória ou crediário). */
export const temNotaPromissoria = (n: Negociacao) =>
  n.tipo === "venda" && n.pagamentos.some((p) => p.valor_cents > 0 && FORMAS_COM_PROMISSORIA.includes(p.forma));
