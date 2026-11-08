import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { COLUNAS_DA_NEGOCIACAO, type Negociacao } from "@/lib/pdv/regras";
import { createClient } from "@/lib/supabase/server";

import { DashboardClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

/**
 * A TELA INICIAL. Não tem item no menu: abre ao entrar e pelo logo da barra.
 * Todos da organização veem (o que cada um lê continua sendo decidido pela RLS).
 * Os últimos 30 dias de vendas bastam para o gráfico e os cartões; o filtro de
 * período roda no navegador sobre esse mesmo recorte.
 */
export default async function DashboardPage() {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app/settings/profile");

  const supabase = await createClient();
  const desde = new Date(Date.now() - 32 * 24 * 3600 * 1000).toISOString();
  const [negociacoes, veiculos, contatos] = await Promise.all([
    supabase
      .from("negociacoes_de_veiculo")
      .select(COLUNAS_DA_NEGOCIACAO)
      .eq("organization_id", activeOrg.orgId)
      .eq("status", "concluida")
      .eq("tipo", "venda")
      .gte("concluida_em", desde)
      .order("concluida_em", { ascending: false })
      .limit(2000),
    supabase.from("veiculos").select("status").eq("organization_id", activeOrg.orgId).limit(5000),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", activeOrg.orgId),
  ]);
  if (negociacoes.error) throw new Error(`Não consegui ler as vendas: ${negociacoes.error.message}`);

  const estoque = { disponivel: 0, reservado: 0, vendido: 0 };
  for (const v of veiculos.data ?? []) {
    if (v.status in estoque) estoque[v.status as keyof typeof estoque] += 1;
  }

  return (
    <DashboardClient
      negociacoes={(negociacoes.data ?? []) as unknown as Negociacao[]}
      estoque={estoque}
      totalDeContatos={contatos.count ?? 0}
      titulo={t("Dashboard")}
    />
  );
}
