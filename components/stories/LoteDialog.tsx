"use client";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import { avaliarSlots, distribuirNoLote } from "@/lib/channels/social/stories/janelas";
import { API, CHAVE, fusoLocal, paraInputLocal, type EstadoDosStories, type Midia } from "./tipos";
import { MidiaCampo } from "./MidiaCampo";
import { ContasCampo } from "./ContasCampo";

export function LoteDialog({ estado, onFechar }: { estado: EstadoDosStories; onFechar: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const ativas = estado.janelas.filter((j) => j.ativa);
  const [midias, setMidias] = useState<Midia[]>([]);
  const [contas, setContas] = useState<string[]>(estado.accounts.length === 1 ? [estado.accounts[0]!.id] : []);
  const [dia, setDia] = useState(() => paraInputLocal(new Date()).slice(0, 10));
  const [janelaId, setJanelaId] = useState(ativas[0]?.id ?? "");
  const [salvando, setSalvando] = useState(false);

  const plano = useMemo(() => {
    const janela = ativas.find((j) => j.id === janelaId);
    if (!janela || !dia) return null;
    const [a, m, d] = dia.split("-").map(Number);
    const data = new Date(a!, m! - 1, d!);
    const doDia = estado.items.filter((s) => new Date(s.agendada_para).toDateString() === data.toDateString());
    const av = avaliarSlots(janela, data, doDia);
    const dist = distribuirNoLote(midias, av.slots);
    return { data, av, dist };
  }, [ativas, janelaId, dia, estado.items, midias]);

  async function salvar() {
    if (!plano || !plano.dist.cabe || !midias.length) return;
    if (!contas.length) return toast.error(t("Escolha ao menos uma conta."));
    setSalvando(true);
    try {
      const itens = plano.dist.atribuicoes.map((a) => {
        const [h, m] = a.hora.split(":").map(Number);
        const quando = new Date(plano.data.getFullYear(), plano.data.getMonth(), plano.data.getDate(), h!, m!);
        return { midia: a.item, legenda: "", agendada_para: quando.toISOString() };
      });
      await apiClient.post(API, { action: "batch", lote: { account_ids: contas, itens, fuso: fusoLocal() } });
      toast.success(t("Lote agendado."));
      await qc.invalidateQueries({ queryKey: CHAVE });
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Não foi possível agendar o lote."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Agendar em lote")}</DialogTitle>
        </DialogHeader>
        {ativas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Crie uma janela de horários primeiro (Configurar janelas).")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>{t("Arquivos (na ordem de envio)")}</Label>
              <MidiaCampo multiplo midia={null} onVarias={(n) => setMidias((m) => [...m, ...n])} />
              {midias.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {midias.length} {t("arquivos")} ·{" "}
                  <button type="button" className="underline" onClick={() => setMidias([])}>{t("limpar")}</button>
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("Contas")}</Label>
              <ContasCampo contas={estado.accounts} valor={contas} onChange={setContas} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lote-dia">{t("Dia")}</Label>
                <Input id="lote-dia" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lote-janela">{t("Janela")}</Label>
                <select id="lote-janela" value={janelaId} onChange={(e) => setJanelaId(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
                  {ativas.map((j) => (
                    <option key={j.id} value={j.id}>{j.nome} ({j.inicio}–{j.fim})</option>
                  ))}
                </select>
              </div>
            </div>
            {plano && (
              <p className={`text-sm ${plano.av.dia_ativo && plano.dist.cabe ? "text-muted-foreground" : "text-error"}`}>
                {!plano.av.dia_ativo
                  ? t("A janela não está ativa neste dia da semana.")
                  : `${plano.av.livres} ${t("horários livres")} · ${plano.dist.atribuicoes.map((a) => a.hora).join(", ") || "—"}${plano.dist.faltam ? ` · ${t("faltam")} ${plano.dist.faltam}` : ""}`}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>{t("Cancelar")}</Button>
          <Button disabled={salvando || !plano || !plano.av.dia_ativo || !plano.dist.cabe || midias.length === 0} onClick={salvar}>
            {salvando ? t("Agendando…") : t("Agendar lote")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
