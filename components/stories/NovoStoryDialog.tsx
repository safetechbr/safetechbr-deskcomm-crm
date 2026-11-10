"use client";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import { datasPorDiasDaSemana, datasPorDiasEscolhidos, REGRAS_DE_STORY, sugerirHorario } from "@/lib/channels/social/stories/regras";
import { chaveDoDia } from "@/lib/channels/social/stories/janelas";
import { API, CHAVE, DIAS_CURTOS, fusoLocal, paraInputLocal, type EstadoDosStories, type Midia } from "./tipos";
import { MidiaCampo } from "./MidiaCampo";
import { ContasCampo } from "./ContasCampo";

type Modo = "nenhuma" | "semana" | "datas";

export function NovoStoryDialog({ estado, dia, hora, onFechar }: { estado: EstadoDosStories; dia: Date; hora?: string; onFechar: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const inicial = useMemo(() => {
    if (hora) {
      const [h, m] = hora.split(":").map(Number);
      return new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h ?? 0, m ?? 0);
    }
    return sugerirHorario(dia, estado.items);
  }, [dia, hora, estado.items]);
  const [midia, setMidia] = useState<Midia | null>(null);
  const [legenda, setLegenda] = useState("");
  const [quando, setQuando] = useState(paraInputLocal(inicial));
  const [contas, setContas] = useState<string[]>(estado.accounts.length === 1 ? [estado.accounts[0]!.id] : []);
  const [modo, setModo] = useState<Modo>("nenhuma");
  const [dias, setDias] = useState<number[]>([]);
  const [semanas, setSemanas] = useState(4);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [novoDia, setNovoDia] = useState("");
  const [salvando, setSalvando] = useState(false);

  const base = new Date(quando);
  const baseValida = !Number.isNaN(base.getTime());
  const datas = !baseValida
    ? []
    : modo === "semana"
      ? datasPorDiasDaSemana(base, dias, semanas)
      : modo === "datas"
        ? datasPorDiasEscolhidos(base, escolhidos)
        : [base];
  const excede = datas.length > REGRAS_DE_STORY.max_por_serie;

  async function salvar() {
    if (!midia) return toast.error(t("Escolha a imagem ou o vídeo do Story."));
    if (!contas.length) return toast.error(t("Escolha ao menos uma conta."));
    if (!baseValida || datas.length === 0) return toast.error(t("Data inválida."));
    if (excede) return toast.error(t("O máximo é 100 Stories por série."));
    setSalvando(true);
    try {
      await apiClient.post(API, {
        action: "create",
        story: { midia, legenda, account_ids: contas, datas: datas.map((d) => d.toISOString()), fuso: fusoLocal() },
      });
      toast.success(datas.length > 1 ? t("Série de Stories agendada.") : t("Story agendado."));
      await qc.invalidateQueries({ queryKey: CHAVE });
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Não foi possível agendar."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Novo Story")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>{t("Mídia")}</Label>
            <MidiaCampo midia={midia} onChange={setMidia} />
            <p className="text-xs text-muted-foreground">{t("Imagem JPG/PNG até 8 MB ou vídeo MP4/MOV de 3 a 60 s.")}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("Contas")}</Label>
            <ContasCampo contas={estado.accounts} valor={contas} onChange={setContas} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="story-legenda">{t("Legenda")}</Label>
            <Textarea id="story-legenda" value={legenda} maxLength={2200} onChange={(e) => setLegenda(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="story-quando">{t("Data e hora")}</Label>
            <Input id="story-quando" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("Repetir")}</Label>
            <div className="flex gap-2">
              {([["nenhuma", "Não repetir"], ["semana", "Dias da semana"], ["datas", "Datas escolhidas"]] as const).map(([v, r]) => (
                <Button key={v} type="button" size="sm" variant={modo === v ? "default" : "outline"} onClick={() => setModo(v)}>
                  {t(r)}
                </Button>
              ))}
            </div>
            {modo === "semana" && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1">
                  {DIAS_CURTOS.map((d, i) => (
                    <Button key={d} type="button" size="sm" variant={dias.includes(i) ? "default" : "outline"} onClick={() => setDias(dias.includes(i) ? dias.filter((x) => x !== i) : [...dias, i])}>
                      {d}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Label htmlFor="story-semanas">{t("Por quantas semanas")}</Label>
                  <Input id="story-semanas" type="number" min={1} max={52} className="w-20" value={semanas} onChange={(e) => setSemanas(Math.max(1, Number(e.target.value) || 1))} />
                </div>
              </div>
            )}
            {modo === "datas" && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Input type="date" value={novoDia} onChange={(e) => setNovoDia(e.target.value)} />
                  <Button type="button" variant="outline" disabled={!novoDia} onClick={() => { if (!escolhidos.includes(novoDia)) setEscolhidos([...escolhidos, novoDia].sort()); setNovoDia(""); }}>
                    {t("Adicionar")}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {escolhidos.map((c) => (
                    <Button key={c} type="button" size="sm" variant="outline" onClick={() => setEscolhidos(escolhidos.filter((x) => x !== c))}>
                      {c.split("-").reverse().join("/")} ✕
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {modo !== "nenhuma" && (
              <p className={`text-xs ${excede ? "text-error" : "text-muted-foreground"}`}>
                {datas.length} {t("Stories serão criados")}
                {datas.length > 0 && baseValida ? ` (${chaveDoDia(datas[0]!).split("-").reverse().join("/")} → ${chaveDoDia(datas[datas.length - 1]!).split("-").reverse().join("/")})` : ""}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>{t("Cancelar")}</Button>
          <Button disabled={salvando || excede} onClick={salvar}>{salvando ? t("Agendando…") : t("Agendar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
