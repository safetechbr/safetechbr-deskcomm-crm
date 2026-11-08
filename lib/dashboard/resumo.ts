/**
 * O RESUMO DA TELA INICIAL. Só cálculo, sem banco: a página lê as negociações e
 * o estoque e entrega para cá. O dia é o de São Paulo (a loja roda no Brasil),
 * nunca o do servidor — uma venda às 22h não pode cair no "amanhã" em UTC.
 */
import type { Negociacao } from "@/lib/pdv/regras";

const FUSO = "America/Sao_Paulo";

export type Periodo = 7 | 15 | 30;

/** "2026-11-07" no fuso da loja. */
export function diaDaLoja(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(iso));
}

function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface PontoDoDia {
  dia: string;
  vendas: number;
  receita_cents: number;
}

export interface FormaDoDia {
  forma: string;
  valor_cents: number;
}

export interface Resumo {
  vendas_hoje: number;
  vendas_ontem: number;
  receita_hoje_cents: number;
  receita_ontem_cents: number;
  /** Receita de hoje por forma de pagamento, maior primeiro. Troca entra como "troca". */
  formas_hoje: FormaDoDia[];
  serie: PontoDoDia[];
  recentes: Negociacao[];
  /** Modelos mais vendidos no período. */
  mais_vendidos: { titulo: string; quantidade: number }[];
}

function efetiva(n: Negociacao): boolean {
  return n.tipo === "venda" && n.status === "concluida";
}

function receitaDe(n: Negociacao): number {
  return Math.max(0, n.valor_cents - (n.desconto_cents ?? 0));
}

export function montarResumo(
  negociacoes: Negociacao[],
  periodo: Periodo,
  agora: Date,
  tituloDoVeiculo: (n: Negociacao) => string,
): Resumo {
  const hoje = diaDaLoja(agora);
  const ontem = somarDias(hoje, -1);
  const dias = Array.from({ length: periodo }, (_, i) => somarDias(hoje, i - (periodo - 1)));
  const serie = new Map<string, PontoDoDia>(
    dias.map((dia) => [dia, { dia, vendas: 0, receita_cents: 0 }]),
  );
  const formas = new Map<string, number>();
  const modelos = new Map<string, number>();
  let vendasHoje = 0;
  let vendasOntem = 0;
  let receitaHoje = 0;
  let receitaOntem = 0;

  const vendas = negociacoes.filter(efetiva);
  for (const n of vendas) {
    const dia = diaDaLoja(n.concluida_em ?? n.created_at);
    const receita = receitaDe(n);
    const ponto = serie.get(dia);
    if (ponto) {
      ponto.vendas += 1;
      ponto.receita_cents += receita;
      const titulo = tituloDoVeiculo(n);
      if (titulo) modelos.set(titulo, (modelos.get(titulo) ?? 0) + 1);
    }
    if (dia === ontem) {
      vendasOntem += 1;
      receitaOntem += receita;
    }
    if (dia === hoje) {
      vendasHoje += 1;
      receitaHoje += receita;
      for (const p of n.pagamentos ?? []) {
        formas.set(p.forma, (formas.get(p.forma) ?? 0) + p.valor_cents);
      }
      if (n.troca) {
        const liquido = Math.max(0, (n.troca.valor_cents ?? 0) - (n.troca.quitacao_cents ?? 0));
        if (liquido > 0) formas.set("troca", (formas.get("troca") ?? 0) + liquido);
      }
    }
  }

  return {
    vendas_hoje: vendasHoje,
    vendas_ontem: vendasOntem,
    receita_hoje_cents: receitaHoje,
    receita_ontem_cents: receitaOntem,
    formas_hoje: [...formas].map(([forma, valor_cents]) => ({ forma, valor_cents })).sort((a, b) => b.valor_cents - a.valor_cents),
    serie: dias.map((d) => serie.get(d)!),
    recentes: [...vendas]
      .sort((a, b) => (b.concluida_em ?? b.created_at).localeCompare(a.concluida_em ?? a.created_at))
      .slice(0, 8),
    mais_vendidos: [...modelos]
      .map(([titulo, quantidade]) => ({ titulo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 8),
  };
}

/** Variação em %, ou null quando não há base para comparar (ontem zerado). */
export function variacaoPercentual(hoje: number, ontem: number): number | null {
  if (ontem <= 0) return null;
  return Math.round(((hoje - ontem) / ontem) * 1000) / 10;
}
