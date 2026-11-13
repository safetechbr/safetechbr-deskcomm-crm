"use client";
import { useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useSendMessage } from "@/hooks/inbox/useSendMessage";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { randomId } from "@/lib/random-id";
import { tituloDoVeiculo, type ModoDeEnvio, type Veiculo } from "@/lib/veiculos/regras";

interface ItemDeEnvio {
  type: "text" | "image" | "video";
  body: string | null;
  media_storage_path?: string;
  media_mime?: string;
}
interface Preparado {
  itens: ItemDeEnvio[];
  fotos_faltando: number | boolean;
}
interface Pedido {
  veiculo: Veiculo;
  modo: ModoDeEnvio;
  comVideo: boolean;
  texto?: string;
}
interface Envio extends Pedido {
  id: string;
  conversationId: string;
}

/** A MutationCache mantém a tarefa mesmo após fechar/recolher/trocar o painel. */
export function useEnvioDeVeiculo(orgId: string | undefined, conversationId: string) {
  const t = useT();
  const qc = useQueryClient();
  const send = useSendMessage();
  const chave = ["envio-veiculo", orgId, conversationId];
  const pendentes = useMutationState({
    filters: { mutationKey: chave, status: "pending" },
    select: (m) => ({
      veiculoId: (m.state.variables as Envio).veiculo.id,
      naFila: m.state.isPaused,
    }),
  });
  const envio = useMutation({
    mutationKey: chave,
    // Veículos da mesma conversa saem em sequência; conversas diferentes seguem livres.
    scope: { id: JSON.stringify(chave) },
    retry: false,
    onMutate: (p: Envio) => {
      toast.loading(`${t("Aguardando envio")}: ${tituloDoVeiculo(p.veiculo)}`, { id: p.id });
    },
    mutationFn: async (p: Envio) => {
      toast.loading(`${t("Preparando envio")}: ${tituloDoVeiculo(p.veiculo)}`, { id: p.id });
      const { data } = await apiClient.post<{ data: Preparado }>(
        `/api/v1/veiculos/${p.veiculo.id}/preparar-envio`,
        {
          conversation_id: p.conversationId,
          modo: p.modo,
          com_video: p.comVideo,
          ...(p.texto ? { texto: p.texto } : {}),
        },
      );
      if (!data.itens.length) throw new Error(t("Nenhum item disponível para enviar."));
      for (let i = 0; i < data.itens.length; i++) {
        const item = data.itens[i]!;
        toast.loading(
          `${t("Enviando")}: ${tituloDoVeiculo(p.veiculo)} (${i + 1}/${data.itens.length})`,
          { id: p.id },
        );
        await send.mutateAsync({
          conversation_id: p.conversationId,
          type: item.type,
          body: item.body ?? undefined,
          media_storage_path: item.media_storage_path,
          media_mime: item.media_mime,
          metadata: { veiculo_id: p.veiculo.id },
        });
        if (i < data.itens.length - 1) await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      return data;
    },
    onSuccess: (data, p) => {
      toast.success(`${t("Enviado")}: ${tituloDoVeiculo(p.veiculo)}`, { id: p.id });
      if (data.fotos_faltando) toast.warning(t("Algumas fotos não puderam ser enviadas."));
    },
    onError: (error, p) => {
      toast.error(`${t("Envio interrompido")}: ${tituloDoVeiculo(p.veiculo)}`, {
        id: p.id,
        description: `${error.message} ${t("Confira o histórico antes de reenviar para evitar mensagens duplicadas.")}`,
        duration: 10000,
      });
    },
  });

  function iniciar(pedido: Pedido) {
    // Consulta síncrona: bloqueia o clique duplo e a repetição após remontar o painel.
    const duplicado = qc
      .getMutationCache()
      .findAll({ mutationKey: chave, status: "pending" })
      .some((m) => (m.state.variables as Envio).veiculo.id === pedido.veiculo.id);
    if (duplicado) return;
    envio.mutate({ ...pedido, id: `envio-veiculo-${randomId()}`, conversationId });
  }
  return { iniciar, pendentes };
}
