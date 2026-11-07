"use client";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { MagnifyingGlass } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { CommandPalette } from "@/components/shell/CommandPalette";

export function SearchTrigger() {
  const t = useT();
  const [open, setOpen] = useState(false);

  // `enableOnFormTags`: o atalho precisa funcionar com o cursor dentro do
  // composer do inbox, que é onde o operador passa o dia.
  useHotkeys("mod+k", () => setOpen(true), { preventDefault: true, enableOnFormTags: true });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-2 rounded-full border-border/80 bg-card px-3.5 font-normal text-muted-foreground shadow-xs transition-[border-color,box-shadow] duration-base hover:border-border-strong hover:bg-card hover:text-foreground hover:shadow-sm md:w-full md:justify-start"
        onClick={() => setOpen(true)}
      >
        <MagnifyingGlass size={15} aria-hidden />
        <span className="max-md:sr-only">{t("Buscar...")}</span>
        <kbd className="ml-auto hidden rounded-md border border-border/80 bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium tracking-wide md:inline">⌘K</kbd>
      </Button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
