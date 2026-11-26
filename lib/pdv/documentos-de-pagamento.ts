/**
 * Carrega o que o recibo e o termo de quitação precisam: a negociação, a loja
 * (a mesma regra do contrato), os lançamentos de entrada da venda (sem estornos)
 * e os recibos já emitidos.
 */
import type { createClient } from "@/lib/supabase/server";
import { marcaDaOrganizacaoParaPdf } from "@/lib/propostas/marca-da-organizacao-para-pdf";

import type { LojaDoContrato } from "./contrato";
import type { LancamentoDaVenda, ReciboDePagamento } from "./recibo-pagamento";
import { COLUNAS_DA_NEGOCIACAO, type Negociacao } from "./regras";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Fotografia contratual quando existe; senão, dados atuais da organização (histórico). */
export async function lojaDaNegociacao(
  supabase: Supabase,
  orgId: string,
  negociacao: Negociacao,
): Promise<LojaDoContrato> {
  const e = negociacao.contrato?.empresa;
  if (e)
    return { razaoSocial: e.razao_social, nomeFantasia: e.nome_fantasia, cnpj: e.cnpj, cidade: e.cidade, logoUrl: null };
  const [{ data: org }, marca] = await Promise.all([
    supabase.from("organizations").select("legal_name, display_name, cnpj").eq("id", orgId).maybeSingle(),
    marcaDaOrganizacaoParaPdf(supabase, orgId),
  ]);
  const o = (org ?? {}) as { legal_name?: string; display_name?: string; cnpj?: string | null };
  return {
    razaoSocial: [o.legal_name, o.display_name].find(Boolean) ?? "Loja",
    nomeFantasia: [marca.appName, o.display_name, o.legal_name].find(Boolean) ?? "Loja",
    cnpj: o.cnpj ?? null,
    logoUrl: marca.logoUrl,
    cidade: null,
  };
}

export interface DocumentosDePagamento {
  negociacao: Negociacao;
  lancamentos: LancamentoDaVenda[];
  recibos: ReciboDePagamento[];
}

/** null quando a negociação não existe nesta loja. Lança em erro de banco. */
export async function carregarDocumentosDePagamento(
  supabase: Supabase,
  orgId: string,
  id: string,
): Promise<DocumentosDePagamento | null> {
  const { data } = await supabase
    .from("negociacoes_de_veiculo")
    .select(COLUNAS_DA_NEGOCIACAO)
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const [lanc, rec] = await Promise.all([
    supabase
      .from("financial_entries")
      .select("id, forma_pagamento, amount_cents, status, paid_at, parcela_numero, parcela_total, due_date")
      .eq("organization_id", orgId)
      .eq("negociacao_id", id)
      .eq("direction", "in")
      .is("reverses_entry_id", null)
      .order("created_at"),
    supabase
      .from("recibos_de_pagamento")
      .select("numero, lancamento_id, valor_cents, forma_pagamento, parcela_numero, parcela_total, recebido_em")
      .eq("organization_id", orgId)
      .eq("negociacao_id", id)
      .order("numero"),
  ]);
  if (lanc.error) throw lanc.error;
  if (rec.error) throw rec.error;
  return {
    negociacao: data as unknown as Negociacao,
    lancamentos: (lanc.data ?? []) as LancamentoDaVenda[],
    recibos: (rec.data ?? []).map((r) => ({ ...r, numero: Number(r.numero), valor_cents: Number(r.valor_cents) })) as ReciboDePagamento[],
  };
}
