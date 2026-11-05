"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { changePassword } from "@/app/actions/settings/changePassword";
import { irAoDesafioDeMfa } from "@/lib/auth/ir-ao-desafio-de-mfa";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Troca de senha de quem já está logado: pede a senha atual antes da nova. */
export function AlterarSenhaCard() {
  const t = useT();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, startSalvar] = useTransition();

  function salvar() {
    if (nova !== confirma) {
      toast.error(t("As senhas não conferem."));
      return;
    }
    startSalvar(async () => {
      const r = await changePassword({
        current_password: atual,
        password: nova,
        password_confirm: confirma,
      });
      if (r.ok) {
        setAtual("");
        setNova("");
        setConfirma("");
        toast.success(t("Senha alterada."));
        return;
      }
      switch (r.error) {
        case "wrong_current_password":
          toast.error(t("A senha atual está incorreta."));
          break;
        case "same_password":
          toast.error(t("A nova senha precisa ser diferente da atual."));
          break;
        case "mfa_required":
          irAoDesafioDeMfa();
          break;
        case "unauthenticated":
          toast.error(t("Sua sessão expirou. Entre de novo."));
          break;
        case "validation_error": {
          const d = r.details as Record<string, string[] | undefined> | undefined;
          toast.error(
            d?.password?.[0] ??
              t("Preencha a senha atual e uma nova senha com 8+ caracteres, letra, número e símbolo."),
          );
          break;
        }
        default:
          toast.error(t("Não consegui salvar essa mudança agora."));
      }
    });
  }

  return (
    <Card className="space-y-3 p-6">
      <div>
        <h2 className="text-sm font-semibold">{t("Alterar senha")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("Digite a senha atual para poder definir uma nova. Mínimo de 8 caracteres, com letra, número e símbolo.")}
        </p>
      </div>
      <form
        className="grid max-w-sm gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="senha-atual">{t("Senha atual")}</Label>
          <Input id="senha-atual" type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="senha-nova">{t("Nova senha")}</Label>
          <Input id="senha-nova" type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="senha-confirma">{t("Confirmar nova senha")}</Label>
          <Input id="senha-confirma" type="password" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
        </div>
        <div>
          <Button type="submit" size="sm" disabled={salvando || !atual || !nova || !confirma}>
            {salvando ? t("Salvando…") : t("Alterar senha")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
