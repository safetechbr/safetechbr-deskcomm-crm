"use client";
import { useEffect, useRef, useState } from "react";
import type { DadosLidosDoDocumento } from "@/lib/pdv/dados-do-documento";
import { validarArquivoDocumento } from "@/lib/pdv/ler-documento-cliente";

export function AnexarDocumentoCliente({
  tipo = "identidade",
  onArquivo,
  onLido,
  onOcupado,
  disabled = false,
}: {
  tipo?: "identidade" | "residencia";
  onArquivo?: (f: File) => void;
  onLido: (dados: DadosLidosDoDocumento) => void;
  onOcupado: (v: boolean) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const controle = useRef<AbortController | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [estado, setEstado] = useState("");
  const [erro, setErro] = useState("");
  useEffect(
    () => () => {
      controle.current?.abort();
    },
    [],
  );
  async function ler(arquivo: File) {
    controle.current?.abort();
    const atual = new AbortController();
    controle.current = atual;
    setErro("");
    setEstado("");
    try {
      validarArquivoDocumento(arquivo);
      onArquivo?.(arquivo);
      setOcupado(true);
      onOcupado(true);
      const { lerDocumentoCliente } = await import("@/lib/pdv/ler-documento-cliente");
      const resultado = await lerDocumentoCliente(
        arquivo,
        atual.signal,
        (texto) => {
          if (!atual.signal.aborted) setEstado(texto);
        },
        tipo,
      );
      if (atual.signal.aborted) return;
      const qtd = Object.keys(resultado.dados).length;
      if (qtd) {
        onLido(resultado.dados);
        setEstado(
          `Dados preenchidos. Confira antes de salvar.${resultado.avisos.length ? " " + resultado.avisos.join(" ") : ""}`,
        );
      } else {
        setEstado("");
        setErro(
          resultado.avisos.join(" ") ||
            "Dados não identificados. Tente outra foto ou preencha manualmente.",
        );
      }
    } catch (e) {
      if (!atual.signal.aborted) {
        setEstado("");
        setErro(e instanceof Error ? e.message : "Não foi possível ler o documento.");
      }
    } finally {
      if (controle.current === atual) {
        controle.current = null;
        setOcupado(false);
        onOcupado(false);
      }
    }
  }
  return (
    <section
      className="space-y-2 rounded-xl border border-border/70 p-3"
      aria-label="Leitura do documento do cliente"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {tipo === "residencia" ? "Comprovante de residência" : "CNH ou identidade"}
        </p>
        <button
          type="button"
          className="rounded-full border px-3 py-2 text-sm disabled:opacity-60"
          disabled={ocupado || disabled}
          onClick={() => input.current?.click()}
        >
          Anexar documento
        </button>
      </div>
      <input
        ref={input}
        type="file"
        className="sr-only"
        aria-label={tipo === "residencia" ? "Comprovante de residência" : "Documento do cliente"}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        disabled={ocupado || disabled}
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = "";
          if (arquivo) void ler(arquivo);
        }}
      />
      {ocupado && (
        <button
          type="button"
          className="text-xs underline"
          onClick={() => {
            controle.current?.abort();
            setEstado("Leitura cancelada.");
          }}
        >
          Cancelar leitura
        </button>
      )}
      {estado && (
        <p role="status" className="text-xs text-muted-foreground">
          {estado}
        </p>
      )}
      {erro && (
        <p role="alert" className="text-xs text-error-fg">
          {erro}
        </p>
      )}
    </section>
  );
}
