"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { useCreateContact } from "@/hooks/contacts/useCreateContact";
import { useT } from "@/hooks/i18n/useT";
import { CaretLeft, IdentificationCard, Phone } from "@/lib/ui/icons";
import { PAIS_PADRAO, perfilDoPais } from "@/lib/legal/perfil-do-pais";
import { contactCreateSchemaDoPais, type ContactCreate } from "@/lib/schemas/contacts";

const CAMPO =
  "h-10 rounded-full border-border/80 bg-surface px-4 shadow-xs focus-visible:border-accent/50 focus-visible:ring-accent/20";

/**
 * ADICIONAR CLIENTE: o cadastro em tela cheia. Grava na MESMA tabela e pela
 * MESMA rota dos Contatos (`POST /api/v1/contacts`, com a régua de CPF e de
 * telefone do país da organização), sempre como `contact_type: "cliente"`.
 */
export function NovoClienteClient() {
  const t = useT();
  const router = useRouter();
  const org = useActiveOrg();
  const perfil = perfilDoPais(org?.country);
  const criar = useCreateContact();
  const [v, setV] = React.useState({ name: "", cpf: "", birthdate: "", phone_number: "", email: "" });
  const [erro, setErro] = React.useState<string | null>(null);
  const campo = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((x) => ({ ...x, [k]: e.target.value }));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!v.name.trim()) return setErro(t("Informe o nome do cliente."));
    if (!v.phone_number.trim() && !v.email.trim()) return setErro(t("Informe o telefone ou o e-mail."));

    const payload: Record<string, unknown> = { reuse_existing_phone: true, source: "manual", contact_type: "cliente", name: v.name.trim() };
    if (v.email.trim()) payload.email = v.email.trim();
    if (v.phone_number.trim()) payload.phone_number = v.phone_number.trim();
    if (v.cpf.trim()) payload.cpf = v.cpf.trim();
    if (v.birthdate) payload.birthdate = v.birthdate;

    const parsed = contactCreateSchemaDoPais(perfil).safeParse(payload);
    if (!parsed.success) return setErro(parsed.error.issues[0]?.message ?? t("Dados inválidos"));

    try {
      await criar.mutateAsync(parsed.data as ContactCreate);
    } catch {
      return; // o toast de erro já saiu pelo hook
    }
    toast.success(t("Cadastro do cliente salvo"));
    router.push("/app/clientes");
  }

  return (
    <form onSubmit={(e) => void salvar(e)} className="mx-auto max-w-3xl space-y-6 p-6" data-testid="novo-cliente">
      <div className="ds-entra">
        <Link
          href="/app/clientes"
          className="inline-flex items-center gap-1 rounded-full text-sm text-muted-foreground transition-colors hover:text-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/30"
        >
          <CaretLeft className="size-4" aria-hidden />
          {t("Clientes")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("Adicionar Cliente")}</h1>
        <p className="text-sm text-muted-foreground">{t("Cadastre um cliente novo da loja.")}</p>
      </div>

      <section
        className="ds-entra space-y-5 rounded-xl border border-border/60 bg-surface p-6 shadow-xs"
        style={{ animationDelay: "50ms" }}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent">
            <IdentificationCard className="size-5" weight="duotone" aria-hidden />
          </span>
          <h2 className="font-semibold">{t("Informações Básicas")}</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="c-nome">{t("Nome Completo")} *</Label>
            <Input id="c-nome" className={CAMPO} value={v.name} onChange={campo("name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-cpf">{perfil.documento.rotulo}</Label>
            <Input id="c-cpf" className={CAMPO} value={v.cpf} onChange={campo("cpf")} placeholder={perfil.documento.exemplo} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-nasc">{t("Data de Nascimento")}</Label>
            <Input id="c-nasc" className={CAMPO} type="date" value={v.birthdate} onChange={campo("birthdate")} />
          </div>
        </div>
      </section>

      <section
        className="ds-entra space-y-5 rounded-xl border border-border/60 bg-surface p-6 shadow-xs"
        style={{ animationDelay: "100ms" }}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Phone className="size-5" weight="duotone" aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold">{t("Informações de Contato")}</h2>
            <p className="text-xs text-muted-foreground">{t("Informe o telefone ou o e-mail.")}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="c-tel">
              {perfil.codigo === PAIS_PADRAO ? t("Telefone (DDD + número)") : t("Telefone (E.164)")}
            </Label>
            <Input id="c-tel" className={CAMPO} value={v.phone_number} onChange={campo("phone_number")} placeholder={perfil.telefoneExemplo} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-email">{t("E-mail")}</Label>
            <Input id="c-email" className={CAMPO} type="email" value={v.email} onChange={campo("email")} placeholder="nome@exemplo.com" />
          </div>
        </div>
      </section>

      {erro && (
        <p role="alert" className="ds-entra rounded-xl border border-error/30 bg-error-bg px-4 py-3 text-sm text-error-fg">
          {erro}
        </p>
      )}
      <div className="ds-entra flex justify-end gap-2" style={{ animationDelay: "150ms" }}>
        <Button asChild variant="ghost" type="button" className="rounded-full">
          <Link href="/app/clientes">{t("Cancelar")}</Link>
        </Button>
        <Button type="submit" disabled={criar.isPending} className="rounded-full px-6">
          {criar.isPending ? t("Salvando…") : t("Salvar Cliente")}
        </Button>
      </div>
    </form>
  );
}
