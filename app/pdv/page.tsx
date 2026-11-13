import { novoContrato } from "@/lib/pdv/modelo-contrato";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { COLUNAS_DA_NEGOCIACAO, type Negociacao } from "@/lib/pdv/regras";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  arquivoPertenceAoVeiculo,
  BUCKET_DAS_FOTOS_DE_VEICULO,
  COLUNAS_DO_VEICULO,
} from "@/lib/veiculos/regras";

import { PdvClient, type VeiculoDoPdv } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "PDV" };

/**
 * O PDV DA LOJA DE CARROS: venda (com troca e pagamento detalhado) e compra de
 * veículo, com contrato em PDF. Todos veem; `agent` ou mais negocia (a rota
 * cobra de novo — esconder o botão é cortesia).
 */
export default async function PdvPage() {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const podeNegociar =
    (user.is_platform_admin && !user.support) || ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;

  const supabase = await createClient();
  const [empresa, estoque, negociacoes] = await Promise.all([
    supabase
      .from("organizations")
      .select("legal_name, display_name, cnpj, dados_contrato")
      .eq("id", activeOrg.orgId)
      .single(),
    supabase
      .from("veiculos")
      .select(COLUNAS_DO_VEICULO)
      .eq("organization_id", activeOrg.orgId)
      .neq("status", "vendido")
      .order("modelo")
      .limit(500),
    supabase
      .from("negociacoes_de_veiculo")
      .select(COLUNAS_DA_NEGOCIACAO)
      .eq("organization_id", activeOrg.orgId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (empresa.error) throw new Error("Não consegui ler os dados da empresa para o contrato.");
  if (estoque.error) throw new Error(`Não consegui ler o estoque: ${estoque.error.message}`);
  const veiculos = (estoque.data ?? []) as unknown as VeiculoDoPdv[];

  // Só a capa de cada carro — é o que o seletor mostra.
  const capas = veiculos
    .map((v) =>
      (v.fotos ?? []).find((c) => arquivoPertenceAoVeiculo(c, activeOrg.orgId, v.id, "foto")),
    )
    .filter((c): c is string => Boolean(c));
  const urlsDasCapas: Record<string, string> = {};
  if (capas.length > 0) {
    const { data: assinadas } = await createAdminClient()
      .storage.from(BUCKET_DAS_FOTOS_DE_VEICULO)
      .createSignedUrls(capas, 3600);
    for (const a of assinadas ?? []) {
      if (a.path && a.signedUrl) urlsDasCapas[a.path] = a.signedUrl;
    }
  }

  return (
    <PdvClient
      estoque={veiculos}
      urlsDasCapas={urlsDasCapas}
      negociacoesIniciais={(negociacoes.data ?? []) as unknown as Negociacao[]}
      podeNegociar={podeNegociar}
      titulo={t("PDV")}
      usuarioId={user.id}
      contratoPadrao={{ ...novoContrato(empresa.data ?? {}), atendido_por: user.full_name ?? "" }}
    />
  );
}
