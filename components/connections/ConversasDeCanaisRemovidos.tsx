"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import type { CanalRemovidoComSobra } from "@/lib/channels/conversas-de-canais-removidos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CircleNotch, Trash } from "@/lib/ui/icons";

interface Previa {
  canais: CanalRemovidoComSobra[];
  total_conversas: number;
  total_mensagens: number;
}

const CHAVE = ["conversas-de-canais-removidos"];

/**
 * Faixa que só aparece quando sobrou conversa de canal JÁ REMOVIDO (ex.: uma
 * integração antiga de WhatsApp/Instagram). Mostra quanto é, por canal, e só
 * apaga depois da confirmação. Canal ativo, pausado ou desconectado não entra.
 */
export function ConversasDeCanaisRemovidos() {
  const t = useT();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [apagando, setApagando] = useState(false);

  const { data } = useQuery({
    queryKey: CHAVE,
    queryFn: async () => (await apiClient.get<{ data: Previa }>("/api/v1/channel-sessions/conversas-removidas")).data,
    retry: false,
  });

  if (!data || data.total_conversas === 0) return null;

  const apagar = async () => {
    setApagando(true);
    try {
      await apiClient.delete("/api/v1/channel-sessions/conversas-removidas", { confirmar: true });
      toast.success(t("Conversas dos canais removidos excluídas."));
      setAberto(false);
      void qc.invalidateQueries({ queryKey: CHAVE });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Não foi possível excluir as conversas."));
    } finally {
      setApagando(false);
    }
  };

  const resumo = `${data.total_conversas} ${data.total_conversas === 1 ? t("conversa") : t("conversas")}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{t("Conversas de canais que já foram removidos")}</p>
          <p className="text-xs text-muted-foreground">
            {`${resumo} ${t("sobraram de canais excluídos e não servem mais.")}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
          <Trash size={14} aria-hidden />
          {t("Revisar e excluir")}
        </Button>
      </div>

      <Dialog open={aberto} onOpenChange={(o) => !o && !apagando && setAberto(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Excluir conversas de canais removidos?")}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>{t("Só entram canais já excluídos. Canais ativos, pausados ou desconectados não são tocados.")}</p>
                <ul className="list-disc space-y-1 pl-5">
                  {data.canais.map((c) => (
                    <li key={c.id}>
                      {`${c.nome} (${c.provider}): ${c.conversas} ${c.conversas === 1 ? t("conversa") : t("conversas")}, ${c.mensagens} ${c.mensagens === 1 ? t("mensagem") : t("mensagens")}`}
                    </li>
                  ))}
                </ul>
                <p className="font-medium text-foreground">{t("Isso não pode ser desfeito.")}</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" disabled={apagando} onClick={() => setAberto(false)}>
              {t("Cancelar")}
            </Button>
            <Button variant="destructive" disabled={apagando} onClick={apagar}>
              {apagando ? <CircleNotch size={14} className="animate-spin" aria-hidden /> : <Trash size={14} aria-hidden />}
              {t("Excluir")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
