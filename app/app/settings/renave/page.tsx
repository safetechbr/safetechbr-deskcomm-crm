/**
 * Configurações → RENAVE. Liga a integração com a Renave Fácil: chave de API,
 * CNPJ da loja, teste de conexão e saldo de créditos.
 *
 * Papel mínimo `manager`, o mesmo de `/api/v1/renave/config` (a rota é quem
 * defende o dado; este gate só evita mostrar a tela a quem não pode usá-la).
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShieldCheck as IconeDoTitulo } from "@/lib/ui/icons";

import { PainelRenave, type ConfigRenaveDaTela } from "./_form";

export const metadata = { title: "RENAVE" };
export const dynamic = "force-dynamic";

export default async function RenavePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  // View segura: nunca devolve a chave cifrada, só os 4 últimos dígitos.
  const { data } = await createAdminClient().from("renave_integracoes_safe")
    .select("last4, tem_chave, cnpj, url_plataforma, ativo, limite_creditos_aviso, bloquear_venda_sem_confirmacao")
    .eq("organization_id", activeOrg.orgId).eq("integradora", "renave_facil").maybeSingle();
  const idioma = user.idioma;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header className="ds-entra flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <IconeDoTitulo size={22} weight="duotone" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{traduzir("RENAVE", idioma)}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {traduzir("Registre entrada e saída dos carros no RENAVE pela Renave Fácil, direto do estoque.", idioma)}
          </p>
        </div>
      </header>

      <PainelRenave config={(data ?? null) as ConfigRenaveDaTela | null} />
    </div>
  );
}
