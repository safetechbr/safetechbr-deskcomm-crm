import { CalendarBlank as IconeDoTitulo } from "@/lib/ui/icons";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { PublicacoesClient } from "@/components/publicacoes/PublicacoesClient";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Publicações" };

export default async function PublicacoesPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }
  const idioma = user.idioma;
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="ds-entra flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <IconeDoTitulo size={22} weight="duotone" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Publicações", idioma)}</h1>
          <p className="text-sm text-muted-foreground">
            {traduzir("Agende posts, carrosséis, Reels e Stories nas suas redes sociais.", idioma)}
          </p>
        </div>
      </header>
      <PublicacoesClient />
    </div>
  );
}
