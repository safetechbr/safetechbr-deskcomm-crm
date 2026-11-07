import { WebhooksLogo as IconeDoTitulo } from "@/lib/ui/icons";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { WebhooksClient, type AbaDosWebhooks } from "./_components/WebhooksClient";

const ABAS: ReadonlyArray<AbaDosWebhooks> = ["receber", "leads", "automacoes", "atividade"];

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Webhooks" };

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  const canManage = !!activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  if (!canManage) redirect("/app/inbox");
  const idioma = user.idioma;
  const pedida = (await searchParams).aba;
  const abaInicial = ABAS.find((a) => a === pedida);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="ds-entra flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <IconeDoTitulo size={22} weight="duotone" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "Receba contatos de fora (landing pages, formulários) e crie automações que agem sozinhas.",
            idioma,
          )}
        </p>
      </div>
      </header>
      <WebhooksClient abaInicial={abaInicial} />
    </div>
  );
}
