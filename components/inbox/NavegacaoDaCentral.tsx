"use client";

import Link from "next/link";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { useFunisDoMenu } from "@/hooks/pipelines/useFunisDoMenu";
import { ChatCircle, ListChecks, Kanban, CaretDown, DotsThree } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type VisaoDaCentral = "tarefas" | "conversas" | "funil" | "outro-funil";

/** Navegação entre a fila de trabalho, o histórico e os quadros já existentes. */
export function NavegacaoDaCentral({
  visao,
  onChange,
  onSelectFunil,
}: {
  visao: VisaoDaCentral;
  onChange: (visao: VisaoDaCentral) => void;
  onSelectFunil: (id: string) => void;
}) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const funis = useFunisDoMenu(aberto);
  return (
    <header className="flex shrink-0 items-center gap-1.5 border-b border-border/60 px-2 py-0.5 lg:py-1">
      <Tabs
        value={visao}
        onValueChange={(valor) => onChange(valor as VisaoDaCentral)}
        className="min-w-0 max-md:flex-1"
      >
        <TabsList
          aria-label={t("Visões da central")}
          className="h-auto rounded-full p-0.5 max-md:w-full max-md:justify-start"
        >
          {(
            [
              ["tarefas", "A fazer", ListChecks],
              ["conversas", "Conversas", ChatCircle],
              ["funil", "Funil principal", Kanban],
            ] as const
          ).map(([id, label, Icon]) => (
            <TabsTrigger
              key={id}
              value={id}
              aria-label={t(label)}
              className="gap-1.5 px-2 text-xs data-[state=active]:bg-accent data-[state=active]:text-accent-foreground max-md:flex-1 max-md:shrink-0 md:px-3 lg:h-7"
            >
              <Icon size={14} aria-hidden className="hidden md:block" />
              {id === "funil" ? (
                <>
                  <span className="md:hidden">{t("Funil")}</span>
                  <span className="hidden md:inline">{t(label)}</span>
                </>
              ) : (
                t(label)
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DropdownMenu open={aberto} onOpenChange={setAberto}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 px-2.5 max-md:w-11 max-md:p-0 aria-pressed:border-accent lg:h-7"
            aria-label={t("Abrir outros funis")}
            aria-pressed={visao === "outro-funil"}
            title={t("Outros funis")}
          >
            <DotsThree size={16} weight="bold" aria-hidden className="md:hidden" />
            <Kanban size={14} aria-hidden className="hidden md:block" />
            <span className="hidden md:inline">{t("Outros funis")}</span>
            <CaretDown size={12} aria-hidden className="hidden md:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 min-w-56 overflow-y-auto">
          {funis.map((f) => (
            <DropdownMenuItem key={f.id} onSelect={() => onSelectFunil(f.id)}>
              {f.name}
            </DropdownMenuItem>
          ))}
          {funis.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem asChild>
            <Link href="/app/kanban">{t("Gerenciar funis")}</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
