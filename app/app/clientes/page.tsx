import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { COLUNAS_DA_NEGOCIACAO, type Negociacao } from "@/lib/pdv/regras";
import { createClient } from "@/lib/supabase/server";

import { ClientesClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Clientes" };

/**
 * CLIENTES: quem foi cadastrado, e o que cada um fez na loja. A lista é a de
 * contatos (mesma tabela, mesma API, que decifra telefone e e-mail); o
 * histórico vem das negociações do PDV ligadas ao contato por `contact_id`.
 * Quem não fez nada tem o histórico vazio.
 */
export default async function ClientesPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("negociacoes_de_veiculo")
    .select(COLUNAS_DA_NEGOCIACAO)
    .eq("organization_id", activeOrg.orgId)
    .not("contact_id", "is", null)
    .neq("status", "excluida")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(`Não consegui ler o histórico dos clientes: ${error.message}`);

  return <ClientesClient negociacoes={(data ?? []) as unknown as Negociacao[]} />;
}
