"use client";
import { useCallback, useSyncExternalStore } from "react";

const EVENTO = "deskcomm:inbox:bloco-recolhivel";

/**
 * Aberto/recolhido de um bloco do painel lateral, lembrado no navegador de
 * quem atende (localStorage). "1" = recolhido, "0" = aberto; sem valor gravado
 * vale `recolhidoPorPadrao`.
 */
export function useBlocoRecolhivel(chave: string, recolhidoPorPadrao: boolean) {
  const assinar = useCallback((aviso: () => void) => {
    window.addEventListener("storage", aviso);
    window.addEventListener(EVENTO, aviso);
    return () => {
      window.removeEventListener("storage", aviso);
      window.removeEventListener(EVENTO, aviso);
    };
  }, []);

  const ler = useCallback((): boolean => {
    try {
      const v = window.localStorage.getItem(chave);
      return v === null ? recolhidoPorPadrao : v === "1";
    } catch {
      return recolhidoPorPadrao;
    }
  }, [chave, recolhidoPorPadrao]);

  const recolhido = useSyncExternalStore(assinar, ler, () => recolhidoPorPadrao);

  const definir = useCallback(
    (valor: boolean) => {
      try {
        window.localStorage.setItem(chave, valor ? "1" : "0");
      } catch {
        // Sem armazenamento (modo privado): o bloco só não lembra a escolha.
      }
      window.dispatchEvent(new Event(EVENTO));
    },
    [chave],
  );

  return [recolhido, definir] as const;
}
