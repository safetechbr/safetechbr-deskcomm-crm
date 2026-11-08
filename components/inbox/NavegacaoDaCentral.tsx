"use client";

import Link from "next/link";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { useFunisDoMenu } from "@/hooks/pipelines/useFunisDoMenu";
import { ChatCircle, ListChecks, Kanban, CaretDown } from "@/lib/ui/icons";
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
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
      <Tabs value={visao} onValueChange={(valor) => onChange(valor as VisaoDaCentral)}>
        <TabsList aria-label={t("Visões da central")} className="h-auto rounded-full">
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
              className="gap-1.5 px-2.5 text-xs data-[state=active]:bg-accent data-[state=active]:text-accent-foreground sm:gap-2 sm:px-4 sm:text-sm lg:min-h-9"
            >
              <Icon size={16} aria-hidden />
              {t(label)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DropdownMenu open={aberto} onOpenChange={setAberto}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="rounded-full"
            aria-label={t("Abrir outros funis")}
            aria-pressed={visao === "outro-funil"}
          >
            <Kanban size={16} aria-hidden />
            {t("Outros funis")}
            <CaretDown size={12} aria-hidden />
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
      <p className="hidden min-w-0 flex-1 text-right text-xs text-muted-foreground lg:block">
        {visao === "tarefas"
          ? t("Fila de atendimento e suas conversas em aberto")
          : visao === "conversas"
            ? t("Histórico das conversas dentro do seu acesso")
            : t("Quadro do funil dentro da central")}
      </p>
    </header>
  );
}
