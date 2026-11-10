"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CaretLeft, CaretRight, Plus } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { DIAS_CURTOS, inicioDaSemana, somarDias } from "./tipos";
import { PilulaDoStory, doDia, type VisaoProps } from "./comum";

export function KanbanSemanal({ itens, onAbrir, onNovo, podeCriar }: VisaoProps) {
  const t = useT();
  const [inicio, setInicio] = useState(() => inicioDaSemana(new Date()));
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
  const hoje = new Date().toDateString();
  const rotulo = `${dias[0]!.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${dias[6]!.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label={t("Semana anterior")} onClick={() => setInicio(somarDias(inicio, -7))}>
          <CaretLeft />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setInicio(inicioDaSemana(new Date()))}>
          {t("Hoje")}
        </Button>
        <Button variant="outline" size="icon" aria-label={t("Próxima semana")} onClick={() => setInicio(somarDias(inicio, 7))}>
          <CaretRight />
        </Button>
        <span className="text-sm font-medium">{rotulo}</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto md:grid-cols-4 xl:grid-cols-7">
        {dias.map((d) => {
          const lista = doDia(itens, d);
          return (
            <section
              key={d.toISOString()}
              className={`flex min-h-40 flex-col gap-2 rounded-lg border p-2 ${d.toDateString() === hoje ? "border-accent" : "border-border"}`}
            >
              <header className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {DIAS_CURTOS[d.getDay()]} <span className="text-muted-foreground">{d.getDate()}</span>
                </span>
                <Button variant="ghost" size="icon" aria-label={t("Novo Story neste dia")} disabled={!podeCriar} onClick={() => onNovo(d)}>
                  <Plus />
                </Button>
              </header>
              <div className="flex flex-col gap-2">
                {lista.map((s) => (
                  <PilulaDoStory key={s.id} story={s} onAbrir={onAbrir} />
                ))}
                {lista.length === 0 && <p className="text-xs text-muted-foreground">{t("Sem Stories")}</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
