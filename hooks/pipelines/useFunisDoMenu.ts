"use client";
import { useCallback, useEffect, useState } from "react";

export interface FunilDoMenu {
  id: string;
  name: string;
  is_default: boolean;
}

/** Evento que criar/renomear/arquivar funil dispara para o submenu reler. */
export const EVENTO_FUNIS_MUDARAM = "funis-do-menu:mudaram";

/**
 * Os funis para o submenu da barra lateral.
 *
 * Busca simples (sem react-query) de propósito: a barra lateral é montada em
 * lugares sem `QueryClientProvider` (testes de casca, SSR de marca), e o
 * submenu não pode derrubá-los. Falha de rede vira lista vazia — o item "Funis"
 * continua levando à lista completa.
 */
export function useFunisDoMenu(enabled: boolean): FunilDoMenu[] {
  const [funis, setFunis] = useState<FunilDoMenu[]>([]);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/pipelines/menu", { credentials: "same-origin" });
      if (!r.ok) return;
      const corpo = (await r.json()) as { data?: { pipelines?: FunilDoMenu[] } };
      setFunis(corpo.data?.pipelines ?? []);
    } catch {
      // Sem rede: mantém o que tinha.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void carregar();
    window.addEventListener(EVENTO_FUNIS_MUDARAM, carregar);
    return () => window.removeEventListener(EVENTO_FUNIS_MUDARAM, carregar);
  }, [enabled, carregar]);

  return funis;
}
