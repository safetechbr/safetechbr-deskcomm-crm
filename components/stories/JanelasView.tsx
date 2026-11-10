"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import { avaliarSlots, type StatusDoSlot } from "@/lib/channels/social/stories/janelas";
import { DIAS_LONGOS, paraInputLocal } from "./tipos";
import type { VisaoProps } from "./comum";

const COR: Record<StatusDoSlot, string> = {
  livre: "border-success text-success hover:bg-accent-soft",
  ocupado: "border-info bg-accent-soft text-accent",
  publicado: "border-success bg-success/10 text-success",
  falhou: "border-error bg-error/10 text-error",
  conflito: "border-warning bg-warning/10 text-warning",
  passado: "border-border text-muted-foreground opacity-60",
};
const NOME: Record<StatusDoSlot, string> = {
  livre: "Livre", ocupado: "Agendado", publicado: "Publicado", falhou: "Falhou", conflito: "Conflito", passado: "Passou",
};

export function JanelasView({ estado, itens, onAbrir, onNovo, podeCriar }: Omit<VisaoProps, "onNovo"> & { onNovo: (dia: Date, hora?: string) => void }) {
  const t = useT();
  const [diaTxt, setDiaTxt] = useState(() => paraInputLocal(new Date()).slice(0, 10));
  const [a, m, d] = diaTxt.split("-").map(Number);
  const dia = new Date(a!, m! - 1, d!);
  const doDia = itens.filter((s) => new Date(s.agendada_para).toDateString() === dia.toDateString());
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Input type="date" className="w-44" value={diaTxt} onChange={(e) => e.target.value && setDiaTxt(e.target.value)} />
        <span className="text-sm text-muted-foreground">{DIAS_LONGOS[dia.getDay()]}</span>
      </div>
      {estado.janelas.length === 0 && <p className="text-sm text-muted-foreground">{t("Nenhuma janela criada. Use “Configurar janelas”.")}</p>}
      {estado.janelas.map((j) => {
        const av = avaliarSlots(j, dia, doDia);
        return (
          <section key={j.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <header className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{j.nome}</h3>
              <span className="text-xs text-muted-foreground">{j.inicio}–{j.fim} · {j.intervalo_min} min</span>
              {!j.ativa && <Badge variant="neutral">{t("Inativa")}</Badge>}
              {j.ativa && av.dia_ativo && (
                <span className="text-xs text-muted-foreground">{av.livres}/{av.total} {t("livres")}</span>
              )}
            </header>
            {!av.dia_ativo ? (
              <p className="text-xs text-muted-foreground">{t("Janela não ativa neste dia.")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {av.slots.map((s) => (
                  <Button
                    key={s.hora}
                    type="button"
                    size="sm"
                    variant="outline"
                    className={COR[s.status]}
                    disabled={s.status === "passado" || (s.status === "livre" && !podeCriar)}
                    title={t(NOME[s.status])}
                    onClick={() => (s.story ? onAbrir(s.story.id) : onNovo(dia, s.hora))}
                  >
                    {s.hora}
                  </Button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
