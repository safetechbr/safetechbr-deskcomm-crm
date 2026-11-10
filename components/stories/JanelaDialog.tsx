"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import { Trash } from "@/lib/ui/icons";
import { API, CHAVE, DIAS_CURTOS, type Janela } from "./tipos";

type Rascunho = Omit<Janela, "id"> & { id?: string };
const NOVA: Rascunho = { nome: "", inicio: "08:00", fim: "10:00", intervalo_min: 3, dias_semana: [0, 1, 2, 3, 4, 5, 6], ativa: true };

export function JanelaDialog({ janelas, onFechar }: { janelas: Janela[]; onFechar: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Rascunho | null>(null);
  const [busy, setBusy] = useState(false);

  async function chamar(corpo: object, ok: string) {
    setBusy(true);
    try {
      await apiClient.post(API, corpo);
      toast.success(ok);
      await qc.invalidateQueries({ queryKey: CHAVE });
      setEdit(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Não foi possível salvar."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Janelas de horários")}</DialogTitle>
        </DialogHeader>
        {edit ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="j-nome">{t("Nome")}</Label>
              <Input id="j-nome" value={edit.nome} maxLength={60} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="j-ini">{t("Início")}</Label>
                <Input id="j-ini" type="time" value={edit.inicio} onChange={(e) => setEdit({ ...edit, inicio: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="j-fim">{t("Fim")}</Label>
                <Input id="j-fim" type="time" value={edit.fim} onChange={(e) => setEdit({ ...edit, fim: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="j-int">{t("Intervalo (min)")}</Label>
                <Input id="j-int" type="number" min={1} max={240} value={edit.intervalo_min} onChange={(e) => setEdit({ ...edit, intervalo_min: Number(e.target.value) || 1 })} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {DIAS_CURTOS.map((d, i) => {
                const on = edit.dias_semana.includes(i);
                return (
                  <Button key={d} type="button" size="sm" variant={on ? "default" : "outline"} onClick={() => setEdit({ ...edit, dias_semana: on ? edit.dias_semana.filter((x) => x !== i) : [...edit.dias_semana, i].sort() })}>
                    {d}
                  </Button>
                );
              })}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edit.ativa} onChange={(e) => setEdit({ ...edit, ativa: e.target.checked })} /> {t("Janela ativa")}
            </label>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEdit(null)}>{t("Voltar")}</Button>
              <Button disabled={busy || !edit.nome.trim() || edit.dias_semana.length === 0} onClick={() => chamar({ action: "janela_salvar", janela: edit }, t("Janela salva."))}>
                {t("Salvar")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {janelas.length === 0 && <p className="text-sm text-muted-foreground">{t("Nenhuma janela criada.")}</p>}
            {janelas.map((j) => (
              <div key={j.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                <button type="button" className="text-left" onClick={() => setEdit(j)}>
                  <span className="font-medium">{j.nome}</span>{" "}
                  <span className="text-muted-foreground">{j.inicio}–{j.fim} · {j.intervalo_min} min{j.ativa ? "" : ` · ${t("inativa")}`}</span>
                </button>
                <Button variant="ghost" size="icon" aria-label={t("Excluir janela")} disabled={busy} onClick={() => chamar({ action: "janela_excluir", id: j.id }, t("Janela excluída."))}>
                  <Trash />
                </Button>
              </div>
            ))}
            <Button variant="outline" onClick={() => setEdit(NOVA)}>{t("Nova janela")}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
