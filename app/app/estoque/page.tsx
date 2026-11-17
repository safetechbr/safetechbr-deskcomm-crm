import { reservasAtivas } from "@/lib/veiculos/reservas-server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import {
  arquivoPertenceAoVeiculo,
  BUCKET_DAS_FOTOS_DE_VEICULO,
  COLUNAS_DO_VEICULO,
  type Veiculo,
} from "@/lib/veiculos/regras";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { EstoqueClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Estoque" };

/**
 * O ESTOQUE DE VEÍCULOS DA LOJA. Todos veem; só `manager` ou mais cadastra e
 * altera (a rota cobra de novo — esconder o botão é cortesia).
 */
export default async function EstoquePage() {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const podeEditar =
    (user.is_platform_admin && !user.support) || ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("veiculos")
    .select(COLUNAS_DO_VEICULO)
    .eq("organization_id", activeOrg.orgId)
    .neq("status", "em_oficina") // em oficina ainda não é estoque: só entra ao ser liberado
    .order("status")
    .order("modelo")
    .limit(500);
  if (error) throw new Error(`Não consegui ler o estoque: ${error.message}`);
  const veiculos = (data ?? []) as unknown as Veiculo[];

  const reservas = await reservasAtivas(
    supabase,
    activeOrg.orgId,
    veiculos.map((v) => v.id),
  );
  for (const v of veiculos) v.reserva = reservas.get(v.id) ?? null;

  const caminhos = veiculos.flatMap((v) =>
    (v.fotos ?? []).filter((c) => arquivoPertenceAoVeiculo(c, activeOrg.orgId, v.id, "foto")),
  );
  const urlsDasFotos: Record<string, string> = {};
  if (caminhos.length > 0) {
    const { data: assinadas } = await createAdminClient()
      .storage.from(BUCKET_DAS_FOTOS_DE_VEICULO)
      .createSignedUrls(caminhos, 3600);
    for (const a of assinadas ?? []) {
      if (a.path && a.signedUrl) urlsDasFotos[a.path] = a.signedUrl;
    }
  }

  return (
    <EstoqueClient
      inicial={veiculos}
      urlsDasFotos={urlsDasFotos}
      podeEditar={podeEditar}
      titulo={t("Estoque")}
      subtitulo={t(
        "Os veículos da loja, com fotos e ficha, prontos para enviar ao cliente no atendimento.",
      )}
    />
  );
}
