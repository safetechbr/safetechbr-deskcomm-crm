"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { criarVendedorSchema } from "@/lib/team/criar-vendedor";
import { ROLES, type Role } from "@/lib/schemas/team";
import { rotuloDoPapel } from "@/lib/auth/types";
import { InterfaceEditor } from "@/components/team/InterfaceEditor";
import { interfaceTemDestino, type InterfaceSettings } from "@/lib/navigation/interface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateMemberForm() {
  const t = useT();
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<Role>("agent");
  const [settings, setSettings] = useState<InterfaceSettings>({ preset: "simplificada" });
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criado, setCriado] = useState<string | null>(null);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCriado(null);
    const parsed = criarVendedorSchema.safeParse({ full_name: nome, username: login, password: senha, role: papel, interface_settings: settings });
    if (!parsed.success) { setErro(parsed.error.issues[0]?.message ?? "Confira os campos."); return; }
    setPendente(true);
    try {
      const res = await apiClient.post<{ data: { username: string } }>("/api/v1/team/create", parsed.data);
      setCriado(res.data.username);
      setSenha("");
      setNome("");
      setLogin("");
      await qc.invalidateQueries({ queryKey: ["team"] });
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível concluir o cadastro. Confira a equipe antes de tentar novamente.");
    } finally { setPendente(false); }
  }

  return (
    <form onSubmit={criar} className="max-w-2xl space-y-5">
      <p className="text-sm text-muted-foreground">{t("Você define o login e a senha. O vendedor já pode entrar, sem e-mail, convite ou confirmação.")}</p>
      <fieldset disabled={pendente} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="seller-name">{t("Nome do vendedor")}</Label><Input id="seller-name" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" required minLength={2} maxLength={120} /></div>
        <div className="space-y-2"><Label htmlFor="seller-login">{t("Login")}</Label><Input id="seller-login" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="joao" required minLength={3} maxLength={40} /><p className="text-xs text-muted-foreground">{t("Um login único no sistema, com letras sem acento, números, ponto, hífen ou sublinhado.")}</p></div>
        <div className="space-y-2"><Label htmlFor="seller-password">{t("Senha do vendedor")}</Label><Input id="seller-password" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" required minLength={8} maxLength={128} /><p className="text-xs text-muted-foreground">{t("Pelo menos 8 caracteres. Entregue o login e a senha diretamente ao vendedor; a senha não será exibida depois.")}</p></div>
        <div className="space-y-2"><Label htmlFor="seller-role">{t("Papel")}</Label><select id="seller-role" value={papel} onChange={(e) => setPapel(e.target.value as Role)} className="h-11 w-full rounded-md border bg-background px-3 text-sm">{ROLES.map((r) => <option key={r} value={r}>{t(rotuloDoPapel(r))}</option>)}</select><p className="text-xs text-muted-foreground">{t("Para vendedores, use Atendente. O papel define as permissões reais; a interface abaixo organiza o menu.")}</p></div>
        <InterfaceEditor value={settings} onChange={setSettings} role={papel} />
        <Button type="submit" disabled={pendente || !interfaceTemDestino(settings, papel)}>{t(pendente ? "Criando acesso…" : "Criar vendedor")}</Button>
      </fieldset>
      {erro && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{t(erro)}</p>}
      {criado && <div role="status" className="space-y-2 rounded-md border p-4 text-sm"><p>{t("Acesso criado. O vendedor já pode entrar com o login")} <strong>{criado}</strong> {t("e a senha que você definiu.")}</p><Link href="/app/team" className="underline">{t("Ver equipe e ajustar acessos")}</Link></div>}
    </form>
  );
}
