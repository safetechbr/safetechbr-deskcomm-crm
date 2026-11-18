"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";

/**
 * Pop-up de exclusão que exige o motivo (mín. 3 letras). O motivo vai para o
 * histórico de atividades com o nome de quem excluiu. `aoConfirmar` lança em
 * erro: o pop-up fica aberto para tentar de novo.
 */
export function DialogoDeMotivo({
  aberto,
  aoMudar,
  titulo,
  descricao,
  aoConfirmar,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  titulo: string;
  descricao: string;
  aoConfirmar: (motivo: string) => Promise<void>;
}) {
  const t = useT();
  const id = React.useId();
  const [motivo, setMotivo] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);

  async function confirmar() {
    setEnviando(true);
    try {
      await aoConfirmar(motivo.trim());
      setMotivo("");
      aoMudar(false);
    } catch {
      // Quem chamou já mostrou o erro.
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !enviando && aoMudar(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor={id} className="text-sm font-medium">
            {t("Motivo da exclusão")}
          </label>
          <Textarea
            id={id}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder={t("Ex.: lançado em duplicidade")}
            autoFocus
            data-testid="motivo-da-exclusao"
          />
          <p className="text-xs text-muted-foreground">
            {t("Fica registrado no histórico de atividades com o seu nome.")}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => aoMudar(false)} disabled={enviando}>
            {t("Cancelar")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void confirmar()}
            disabled={motivo.trim().length < 3 || enviando}
            data-testid="confirmar-exclusao"
          >
            {enviando ? t("Excluindo…") : t("Excluir")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
