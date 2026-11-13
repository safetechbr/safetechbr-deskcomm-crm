"use client";

import { ArrowSquareOut, FileText, ImageSquare, X } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";

export function CartaoDocumentoCliente({
  nome,
  tipo,
  tamanho,
  href,
  onRemover,
  disabled = false,
}: {
  nome: string;
  tipo: string;
  tamanho?: number;
  href?: string;
  onRemover?: () => void;
  disabled?: boolean;
}) {
  const imagem = /\.(jpe?g|png|webp)$/i.test(nome);
  const Icone = imagem ? ImageSquare : FileText;
  const formato = nome.split(".").pop()?.toUpperCase();
  const bytes = tamanho
    ? tamanho >= 1024 * 1024
      ? `${(tamanho / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
      : tamanho >= 1024
        ? `${Math.ceil(tamanho / 1024)} KB`
        : `${tamanho} B`
    : null;

  return (
    <li className="flex min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-surface p-3">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
        aria-hidden
      >
        <Icone size={22} weight="regular" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="line-clamp-2 text-sm leading-5 font-medium break-all text-foreground"
          title={nome}
        >
          {nome}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {tipo === "residencia" ? "Comprovante de residência" : "CNH ou identidade"}
          {formato && formato.length <= 5 ? ` · ${formato}` : ""}
          {bytes ? ` · ${bytes}` : ""}
        </p>
      </div>
      {href ? (
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <a href={href} target="_blank" rel="noreferrer" aria-label={`Abrir ${nome}`}>
            <ArrowSquareOut size={16} aria-hidden />
            Abrir
          </a>
        </Button>
      ) : onRemover ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:bg-error/10 hover:text-error-fg"
          disabled={disabled}
          onClick={onRemover}
          aria-label={`Remover ${nome}`}
          title="Remover arquivo"
        >
          <X size={18} aria-hidden />
        </Button>
      ) : null}
    </li>
  );
}
