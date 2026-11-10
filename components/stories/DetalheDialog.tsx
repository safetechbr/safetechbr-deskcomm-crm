"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import { API, CHAVE, NOME_DO_STATUS, VARIANTE_DO_STATUS, paraInputLocal, type EstadoDosStories, type StoryItem } from "./tipos";

export function DetalheDialog({ estado, story, onFechar }: { estado: EstadoDosStories; story: StoryItem; onFechar: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const editavel = story.status === "agendada";
  const [legenda, setLegenda] = useState(story.legenda);
  const [quando, setQuando] = useState(paraInputLocal(new Date(story.agendada_para)));
  const [serie, setSerie] = useState(false);
  const [busy, setBusy] = useState(false);
  const nomes = story.contas.map((c) => estado.accounts.find((a) => a.id === c.id)?.name ?? c.platform).join(", ");
  const escopo = serie && story.serie_id ? "series" : "single";

  async function chamar(corpo: object, ok: string) {
    setBusy(true);
    try {
      await apiClient.post(API, corpo);
      toast.success(ok);
      await qc.invalidateQueries({ queryKey: CHAVE });
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Não foi possível concluir."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("Story")} <Badge variant={VARIANTE_DO_STATUS[story.status]}>{NOME_DO_STATUS[story.status]}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          {story.midias[0]?.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={story.midias[0].url} alt="" className="mx-auto max-h-64 rounded" />
          ) : story.midias[0] ? (
            <video src={story.midias[0].url} controls className="mx-auto max-h-64 rounded" />
          ) : null}
          <p className="text-muted-foreground">{nomes}</p>
          {story.aguardando_motivo && <p className="text-warning">{story.aguardando_motivo}</p>}
          {story.erro && <p className="text-error">{story.erro}</p>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-legenda">{t("Legenda")}</Label>
            <Textarea id="d-legenda" value={legenda} disabled={!editavel} maxLength={2200} onChange={(e) => setLegenda(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-quando">{t("Data e hora")}</Label>
            <Input id="d-quando" type="datetime-local" value={quando} disabled={!editavel} onChange={(e) => setQuando(e.target.value)} />
          </div>
          {story.serie_id && (story.status === "agendada") && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={serie} onChange={(e) => setSerie(e.target.checked)} /> {t("Aplicar à série inteira")}
            </label>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          {story.status === "falhou" && (
            <Button disabled={busy} onClick={() => chamar({ action: "retry", id: story.id }, t("Reenviado para a fila."))}>{t("Reenviar")}</Button>
          )}
          {editavel && (
            <>
              <Button variant="destructive" disabled={busy} onClick={() => chamar({ action: "cancel", id: story.id, escopo }, t("Cancelado."))}>
                {escopo === "series" ? t("Cancelar série") : t("Cancelar Story")}
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  chamar(
                    { action: "edit", edicao: { id: story.id, legenda, agendada_para: new Date(quando).toISOString(), escopo } },
                    t("Story atualizado."),
                  )
                }
              >
                {t("Salvar")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
