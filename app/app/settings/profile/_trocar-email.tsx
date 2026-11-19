"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trocarEmail, type TrocarEmailResult } from "@/app/actions/settings/trocarEmail";
import { useT } from "@/hooks/i18n/useT";

type Erro = Extract<TrocarEmailResult, { ok: false }>["error"];

const MENSAGENS: Record<Erro, string> = {
  validation_error: "Informe um e-mail válido e a senha atual.",
  unauthenticated: "Sua sessão expirou. Entre de novo.",
  same_email: "Esse já é o seu e-mail.",
  mfa_required: "Confirme a verificação em duas etapas antes de trocar o e-mail.",
  wrong_current_password: "Senha atual incorreta.",
  email_in_use: "Esse e-mail já está em uso por outra conta.",
  rate_limited: "Muitas tentativas. Aguarde alguns minutos.",
  update_failed: "Não foi possível pedir a troca agora. Tente de novo.",
};

/** Formulário próprio (fora do form do perfil: form dentro de form é HTML inválido). */
export function TrocarEmail({ email }: { email: string }) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const [novoEmail, setNovoEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await trocarEmail({ email: novoEmail, current_password: senha });
      if (!r.ok) {
        toast.error(t(MENSAGENS[r.error]));
        return;
      }
      setEnviadoPara(novoEmail.trim().toLowerCase());
      setAberto(false);
      setNovoEmail("");
      setSenha("");
    });
  }

  return (
    <Card className="max-w-xl space-y-4 p-6">
      <div className="space-y-2">
        <Label htmlFor="email">{t("Email")}</Label>
        <Input id="email" value={email} disabled />
        {enviadoPara ? (
          <p className="text-xs text-muted-foreground" role="status">
            {t("Enviamos o link de confirmação para")} {enviadoPara}.{" "}
            {t("O e-mail só muda depois do clique; até lá, continue entrando com o atual.")}
          </p>
        ) : null}
        {!aberto ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
            {t("Trocar e-mail")}
          </Button>
        ) : null}
      </div>
      {aberto ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="novo_email">{t("Novo e-mail")}</Label>
            <Input
              id="novo_email"
              type="email"
              autoComplete="email"
              required
              value={novoEmail}
              onChange={(e) => setNovoEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha_atual_email">{t("Senha atual")}</Label>
            <Input
              id="senha_atual_email"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? t("Enviando...") : t("Enviar link de confirmação")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAberto(false)} disabled={isPending}>
              {t("Cancelar")}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
