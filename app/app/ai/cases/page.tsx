import { ClipboardText as IconeDoTitulo } from "@/lib/ui/icons";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { CaseList } from "./_components/CaseList";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  // GET/POST de /api/v1/ai/cases exigem role agent+ (requireRole("agent")) —
  // abaixo disso a rota nem devolve dado, então a tela inteira gate aqui.
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.agent) redirect("/app");
  const idioma = user.idioma;

  return (
    <div className="flex h-[calc(100dvh-3.5rem-var(--space-6)-max(var(--space-6),var(--rodape-ocupado,0px)))] min-h-0 flex-col sm:p-6">
      <CaseList heading={
        <header className="ds-entra flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <IconeDoTitulo size={22} weight="duotone" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Casos", idioma)}</h1>
          <p className="text-sm text-muted-foreground">
            {traduzir(
              "Quando a IA trava em algo que só um humano resolve, ela abre um caso aqui — e continua conversando com o cliente enquanto espera sua resposta.",
              idioma,
            )}
          </p>
        </div>
      </header>
      } />
    </div>
  );
}
