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
import { PAIS_PADRAO, perfilDoPais } from "@/lib/legal/perfil-do-pais";
import { contactCreateSchemaDoPais, type ContactCreate } from "@/lib/schemas/contacts";

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

    const payload: Record<string, unknown> = { source: "manual", contact_type: "cliente", name: v.name.trim() };
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
    toast.success(t("Cliente cadastrado"));
    router.push("/app/clientes");
  }

  return (
    <form onSubmit={(e) => void salvar(e)} className="mx-auto max-w-3xl space-y-6 p-6" data-testid="novo-cliente">
      <div>
        <h1 className="text-2xl font-semibold">{t("Adicionar Cliente")}</h1>
        <p className="text-sm text-muted-foreground">{t("Cadastre um cliente novo da loja.")}</p>
      </div>

      <section className="space-y-4 rounded-xl border p-5">
        <h2 className="font-semibold">{t("Informações Básicas")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="c-nome">{t("Nome Completo")} *</Label>
            <Input id="c-nome" value={v.name} onChange={campo("name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-cpf">{perfil.documento.rotulo}</Label>
            <Input id="c-cpf" value={v.cpf} onChange={campo("cpf")} placeholder={perfil.documento.exemplo} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-nasc">{t("Data de Nascimento")}</Label>
            <Input id="c-nasc" type="date" value={v.birthdate} onChange={campo("birthdate")} />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border p-5">
        <h2 className="font-semibold">{t("Informações de Contato")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="c-tel">
              {perfil.codigo === PAIS_PADRAO ? t("Telefone (DDD + número)") : t("Telefone (E.164)")}
            </Label>
            <Input id="c-tel" value={v.phone_number} onChange={campo("phone_number")} placeholder={perfil.telefoneExemplo} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-email">{t("E-mail")}</Label>
            <Input id="c-email" type="email" value={v.email} onChange={campo("email")} placeholder="nome@exemplo.com" />
          </div>
        </div>
      </section>

      {erro && (
        <p role="alert" className="text-sm text-error-fg">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button asChild variant="ghost" type="button">
          <Link href="/app/clientes">{t("Cancelar")}</Link>
        </Button>
        <Button type="submit" disabled={criar.isPending}>
          {criar.isPending ? t("Salvando…") : t("Salvar Cliente")}
        </Button>
      </div>
    </form>
  );
}
