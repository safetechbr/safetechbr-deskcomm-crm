"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

import { logoEscuroDemais } from "@/lib/branding/logo-escuro-demais";
import { cn } from "@/lib/utils";

/**
 * O logo da instalação/empresa SEM caixa atrás, nos dois temas.
 *
 * Sem arte própria para o escuro, a imagem é medida no navegador: se a arte é
 * escura demais para o fundo escuro, ela ganha um filtro que a deixa clara
 * (`dark:brightness-0 dark:invert`); se tem cor viva, fica como está. Nunca
 * desenha fundo. Falha ao medir (imagem de outra origem sem CORS) = não filtra.
 *
 * `forcarEscuro`: para a prévia, que simula o fundo escuro no MESMO tema real e
 * por isso não pode depender da variante `dark:`.
 */
export function LogoAdaptativo({
  className,
  forcarEscuro = false,
  ...resto
}: ImgHTMLAttributes<HTMLImageElement> & { forcarEscuro?: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  const [escuro, setEscuro] = useState(false);
  const src = typeof resto.src === "string" ? resto.src : null;

  useEffect(() => {
    const img = ref.current;
    if (!img || !src) return;
    let vivo = true;
    const medir = () => {
      try {
        const lado = 64;
        const k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight, 1));
        const w = Math.max(1, Math.round(img.naturalWidth * k));
        const h = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const r = logoEscuroDemais(ctx.getImageData(0, 0, w, h).data);
        if (vivo) setEscuro(r);
      } catch {
        if (vivo) setEscuro(false);
      }
    };
    if (img.complete && img.naturalWidth > 0) medir();
    img.addEventListener("load", medir);
    return () => {
      vivo = false;
      img.removeEventListener("load", medir);
    };
  }, [src]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...resto}
      ref={ref}
      crossOrigin="anonymous"
      className={cn(
        className,
        escuro && (forcarEscuro ? "brightness-0 invert" : "dark:brightness-0 dark:invert"),
      )}
    />
  );
}
