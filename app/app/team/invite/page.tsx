import { UserPlus as IconeDoTitulo } from "@/lib/ui/icons";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { InviteForm } from "./_components/InviteForm";
import { CreateMemberForm } from "./_components/CreateMemberForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

export default async function TeamInvitePage({ searchParams }: { searchParams: Promise<{ modo?: string }> }) {
  const { modo } = await searchParams;
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="ds-entra flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <IconeDoTitulo size={22} weight="duotone" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("Adicionar pessoas à equipe")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Crie um acesso com login e senha ou envie um convite por e-mail.")}
        </p>
      </div>
      </header>
      <Tabs defaultValue={modo === "criar" ? "create" : "invite"}>
        <TabsList><TabsTrigger value="create">{t("Criar vendedor")}</TabsTrigger><TabsTrigger value="invite">{t("Convidar por e-mail")}</TabsTrigger></TabsList>
        <TabsContent value="create" className="mt-5"><CreateMemberForm /></TabsContent>
        <TabsContent value="invite" className="mt-5"><InviteForm /></TabsContent>
      </Tabs>
    </div>
  );
}
