import type { Metadata } from "next";

import { MovimentacoesClient } from "@/components/financeiro/MovimentacoesClient";
import { requireAuth } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { Receipt } from "@/lib/ui/icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Movimentações" };

export default async function Page() {
  const user = await requireAuth();
  const idioma = user.idioma;
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="ds-entra flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Receipt size={22} weight="duotone" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Movimentações", idioma)}</h1>
          <p className="text-sm text-muted-foreground">
            {traduzir("Lançamentos do dia a dia da empresa: receitas e despesas.", idioma)}
          </p>
        </div>
      </header>
      <MovimentacoesClient />
    </div>
  );
}
