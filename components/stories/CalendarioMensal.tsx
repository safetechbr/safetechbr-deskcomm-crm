"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CaretLeft, CaretRight } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { DIAS_CURTOS, somarDias } from "./tipos";
import { doDia, type VisaoProps } from "./comum";

export function CalendarioMensal({ itens, onAbrir, onNovo, podeCriar }: VisaoProps) {
  const t = useT();
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const primeiro = somarDias(mes, -mes.getDay());
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(primeiro, i));
  const hoje = new Date().toDateString();
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label={t("Mês anterior")} onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>
          <CaretLeft />
        </Button>
        <Button variant="outline" size="icon" aria-label={t("Próximo mês")} onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>
          <CaretRight />
        </Button>
        <span className="text-sm font-medium capitalize">{mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
        {DIAS_CURTOS.map((d) => (
          <div key={d} className="bg-surface-elevated p-2 text-center font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {dias.map((d) => {
          const lista = doDia(itens, d).filter((s) => s.status !== "cancelada");
          const fora = d.getMonth() !== mes.getMonth();
          return (
            <div key={d.toISOString()} className={`flex min-h-24 flex-col gap-1 bg-background p-1.5 ${fora ? "opacity-50" : ""}`}>
              <button
                type="button"
                disabled={!podeCriar}
                onClick={() => onNovo(d)}
                className={`self-start rounded px-1 tabular-nums hover:bg-accent-soft ${d.toDateString() === hoje ? "bg-accent text-accent-foreground" : ""}`}
                aria-label={`${t("Novo Story em")} ${d.toLocaleDateString("pt-BR")}`}
              >
                {d.getDate()}
              </button>
              {lista.slice(0, 3).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onAbrir(s.id)}
                  className="truncate rounded bg-accent-soft px-1 text-left text-accent hover:brightness-95"
                >
                  {new Date(s.agendada_para).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </button>
              ))}
              {lista.length > 3 && <span className="text-muted-foreground">+{lista.length - 3}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
