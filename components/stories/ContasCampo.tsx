"use client";
import { useT } from "@/hooks/i18n/useT";
import type { Conta } from "./tipos";

export function ContasCampo({ contas, valor, onChange }: { contas: Conta[]; valor: string[]; onChange: (v: string[]) => void }) {
  const t = useT();
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">{t("Contas")}</legend>
      {contas.map((c) => {
        const on = valor.includes(c.id);
        return (
          <label key={c.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-sm ${on ? "border-accent bg-accent-soft" : "border-border"}`}>
            <input type="checkbox" checked={on} onChange={() => onChange(on ? valor.filter((x) => x !== c.id) : [...valor, c.id])} />
            {c.name}
          </label>
        );
      })}
    </fieldset>
  );
}
