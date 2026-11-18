import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { COLUNAS_DA_NEGOCIACAO, type Negociacao } from "@/lib/pdv/regras";
import { createClient } from "@/lib/supabase/server";

import { HistoricoDeVendasClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Histórico de Vendas" };

/**
 * O HISTÓRICO DE VENDAS: todas as negociações do PDV (venda e compra), com
 * totais no topo, busca, filtros e acesso ao contrato. Todos da organização
 * leem; quem vende abre o PDV pelo menu.
 */
export default async function HistoricoDeVendasPage() {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("negociacoes_de_veiculo")
    .select(COLUNAS_DA_NEGOCIACAO)
    .eq("organization_id", activeOrg.orgId)
    .neq("status", "excluida")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`Não consegui ler o histórico de vendas: ${error.message}`);

  return (
    <HistoricoDeVendasClient
      negociacoes={(data ?? []) as unknown as Negociacao[]}
      titulo={t("Histórico de Vendas")}
      subtitulo={t("Todas as vendas e compras de veículos feitas no PDV.")}
      podeExcluir={ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager}
    />
  );
}
