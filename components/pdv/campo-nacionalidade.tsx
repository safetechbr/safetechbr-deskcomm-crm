"use client";
import { useEffect, useId, useState } from "react";
import { sugerirNacionalidades } from "@/lib/contacts/nacionalidades";

export function CampoNacionalidade({
  valor,
  onChange,
  className,
  obrigatorio,
  campo,
}: {
  valor: string;
  onChange: (v: string) => void;
  className: string;
  obrigatorio?: boolean;
  /** Chave `data-campo` para o PDV levar o operador até aqui. */
  campo?: string;
}) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [indice, setIndice] = useState(0);
  const opcoes = sugerirNacionalidades(valor);
  useEffect(() => {
    if (aberto) document.getElementById(`${id}-${indice}`)?.scrollIntoView?.({ block: "nearest" });
  }, [aberto, id, indice]);
  function selecionar(nome: string) {
    onChange(nome);
    setAberto(false);
    setIndice(0);
  }
  return (
    <div className="relative col-span-2 text-sm">
      <label htmlFor={id} className="text-muted-foreground">
        Nacionalidade
        {obrigatorio ? <span aria-hidden> *</span> : null}
      </label>
      <input
        id={id}
        data-campo={campo}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={aberto}
        aria-controls={`${id}-lista`}
        aria-activedescendant={aberto && opcoes[indice] ? `${id}-${indice}` : undefined}
        autoComplete="off"
        value={valor}
        placeholder="Digite para buscar…"
        className={className}
        maxLength={80}
        data-testid="pdv-cliente-nacionalidade"
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onChange={(e) => {
          onChange(e.target.value);
          setIndice(0);
          setAberto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && aberto) {
            e.preventDefault();
            e.stopPropagation();
            setAberto(false);
          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setAberto(true);
            setIndice((i) =>
              Math.max(0, Math.min(opcoes.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))),
            );
          } else if (e.key === "Enter" && aberto && opcoes[indice]) {
            e.preventDefault();
            selecionar(opcoes[indice]!.nome);
          }
        }}
      />
      {aberto && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          aria-label="Nacionalidades"
          className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {opcoes.map((n, i) => (
            <li
              key={n.nome}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === indice}
              className={`cursor-pointer rounded-lg px-3 py-2 ${i === indice ? "bg-accent-soft" : "hover:bg-muted"}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selecionar(n.nome)}
            >
              {n.nome}
            </li>
          ))}
          {!opcoes.length && (
            <li className="px-3 py-2 text-muted-foreground">Nenhuma nacionalidade encontrada.</li>
          )}
        </ul>
      )}
    </div>
  );
}
