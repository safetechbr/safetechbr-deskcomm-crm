"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateFocusToken } from "@/app/actions/settings/updateFocusToken";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { MENSAGEM_DA_RECUSA_DE_ESCRITA, ehRecusaDeEscrita } from "@/lib/auth/recusa-de-escrita-de-admin";

interface Props {
  /** SE existe token gravado — nunca QUAL. */
  readonly temTokenSalvo: boolean;
  readonly atualizadoEm: string | null;
  /** O token está no `.env` (piso de rollback). */
  readonly temNoAmbiente: boolean;
  readonly leituraFalhou: boolean;
}

export function FormularioDoFocus({ temTokenSalvo, atualizadoEm, temNoAmbiente, leituraFalhou }: Props) {
  const t = useT();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [ocupado, iniciar] = useTransition();

  function salvar() {
    iniciar(async () => {
      const r = await updateFocusToken({ token: token.trim() });
      if (r.ok) {
        setToken("");
        toast.success(t("Token da Focus salvo."));
        router.refresh();
        return;
      }
      if (ehRecusaDeEscrita(r.error)) toast.error(t(MENSAGEM_DA_RECUSA_DE_ESCRITA[r.error]));
      else if (r.error === "invalid_input") toast.error(t("O token parece incompleto. Copie de novo do painel da Focus."));
      else toast.error(`${t("Não deu para salvar, e nada foi gravado.")} ${t(r.error)}`);
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Focus NFe desta instalação")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("É o token de revenda da Focus NFe. Com ele o sistema cadastra a empresa de cada loja na Focus quando ela envia o certificado A1, em Configurações › Fiscal. Vale para a instalação inteira.")}
        </p>
      </header>

      {leituraFalhou ? (
        <p role="alert" className="rounded-md border border-warning/40 bg-warning-bg p-3 text-xs leading-4 text-text-muted">
          {t("Não deu para ler a configuração salva agora, então o que aparece abaixo pode não ser o que está valendo. Recarregue a página antes de trocar qualquer coisa.")}
        </p>
      ) : null}

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="focus-token">{t("Token de revenda da Focus")}</Label>
          <Input
            id="focus-token"
            data-testid="focus-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={temTokenSalvo ? t("••••••••  (já cadastrado)") : t("Cole o token aqui")}
          />
          <p className="text-xs text-muted-foreground">
            {temTokenSalvo
              ? t("Já existe um token cadastrado. Digite um novo para substituir o atual.")
              : t("Ele é guardado cifrado e nunca volta a aparecer nesta tela.")}
          </p>
        </div>

        {temNoAmbiente ? (
          <p data-testid="focus-tem-no-ambiente" className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            {t("Esta instalação também tem o token no arquivo de configuração do servidor. O que você salvar aqui passa a valer no lugar dele.")}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {atualizadoEm ? `${t("Última alteração em")} ${atualizadoEm}.` : t("Nunca configurado por aqui.")}
          </span>
          <Button data-testid="focus-salvar" disabled={token.trim().length < 10 || ocupado} onClick={salvar}>
            {ocupado ? t("Salvando…") : t("Salvar")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
