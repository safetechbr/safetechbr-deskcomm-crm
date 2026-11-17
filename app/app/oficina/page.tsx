import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { COLUNAS_DA_OFICINA, STATUS_EM_OFICINA, type VeiculoNaOficina } from "@/lib/oficina/regras";
import { createClient } from "@/lib/supabase/server";

import { OficinaClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Oficina" };

/**
 * A OFICINA — veículos comprados ou recebidos em troca, ainda fora do Estoque.
 * INTERNA: só gerente ou mais (custo de compra e reparos não são do vendedor).
 */
export default async function OficinaPage() {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const permitido = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  if (!permitido) redirect("/app");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("veiculos")
    .select(COLUNAS_DA_OFICINA)
    .eq("organization_id", activeOrg.orgId)
    .eq("status", STATUS_EM_OFICINA)
    .order("entrada_em", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Não consegui ler a oficina: ${error.message}`);
  const veiculos = (data ?? []) as unknown as Omit<VeiculoNaOficina, "reparos">[];

  const ids = veiculos.map((v) => v.id);
  const porVeiculo = new Map<string, VeiculoNaOficina["reparos"]>();
  if (ids.length > 0) {
    const { data: reparos, error: e2 } = await supabase
      .from("veiculo_reparos")
      .select("id, veiculo_id, descricao, valor_cents")
      .eq("organization_id", activeOrg.orgId)
      .in("veiculo_id", ids)
      .order("created_at");
    if (e2) throw new Error(`Não consegui ler as ordens de serviço: ${e2.message}`);
    for (const r of reparos ?? []) {
      const lista = porVeiculo.get(r.veiculo_id as string) ?? [];
      lista.push({
        id: r.id as string,
        descricao: r.descricao as string,
        valor_cents: Number(r.valor_cents),
      });
      porVeiculo.set(r.veiculo_id as string, lista);
    }
  }
  const inicial: VeiculoNaOficina[] = veiculos.map((v) => ({
    ...v,
    preco_cents: Number(v.preco_cents),
    custo_cents: v.custo_cents === null ? null : Number(v.custo_cents),
    reparos: porVeiculo.get(v.id) ?? [],
  }));

  return (
    <OficinaClient
      inicial={inicial}
      titulo={t("Oficina")}
      subtitulo={t(
        "Veículos comprados ou recebidos em troca. Só entram no Estoque quando você os libera.",
      )}
    />
  );
}
