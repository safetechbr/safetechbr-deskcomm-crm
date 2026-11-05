"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSendMessage } from "@/hooks/inbox/useSendMessage";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import {
  formatarPreco,
  tituloDoVeiculo,
  type ModoDeEnvio,
  type Veiculo,
} from "@/lib/veiculos/regras";

interface Item {
  type: "text" | "image" | "video";
  body: string | null;
  media_storage_path?: string;
  media_mime?: string;
}
interface Preparado {
  titulo: string;
  itens: Item[];
  fotos_faltando: boolean;
}

type VeiculoComCapa = Veiculo & { capa_url?: string | null };

const MODOS: Array<{ id: ModoDeEnvio; rotulo: string }> = [
  { id: "completo", rotulo: "Fotos + ficha" },
  { id: "fotos", rotulo: "Só fotos" },
  { id: "ficha", rotulo: "Só ficha" },
  { id: "preco", rotulo: "Só preço" },
];

const PAUSA_ENTRE_ITENS_MS = 1500;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * "Estoque" no compositor: escolhe o veículo e envia fotos + ficha em um clique.
 *
 * Não existe caminho de envio novo: a rota `preparar-envio` só copia as mídias
 * para a pasta da conversa e devolve a lista; cada item sai por
 * `useSendMessage` (`/api/v1/messages`), então canal, janela de 24 h, opt-out e
 * limites valem como em qualquer mensagem.
 */
export function EstoqueButton({
  conversationId,
  disabled,
}: {
  conversationId: string;
  disabled?: boolean;
}) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="shrink-0"
        disabled={disabled}
        onClick={() => setAberto(true)}
        data-testid="abrir-estoque"
      >
        {t("Estoque")}
      </Button>
      {/* Os hooks de dados só existem com o diálogo aberto. */}
      {aberto ? <DialogoDeEstoque conversationId={conversationId} aoFechar={() => setAberto(false)} /> : null}
    </>
  );
}

function DialogoDeEstoque({ conversationId, aoFechar }: { conversationId: string; aoFechar: () => void }) {
  const t = useT();
  const send = useSendMessage();
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<ModoDeEnvio>("completo");
  const [comVideo, setComVideo] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  // Ficha em revisão: o atendente confere/edita o texto antes de sair.
  const [revisao, setRevisao] = useState<{ veiculo: Veiculo; texto: string } | null>(null);

  const lista = useQuery({
    queryKey: ["veiculos", "disponiveis"],
    queryFn: async () => {
      const r = await apiClient.get<{ data: VeiculoComCapa[] }>("/api/v1/veiculos?status=disponivel&capas=1");
      return r.data;
    },
    staleTime: 30_000,
  });

  const q = busca.trim().toLowerCase();
  const veiculos = (lista.data ?? []).filter(
    (v) => !q || `${v.codigo} ${tituloDoVeiculo(v)} ${v.cor ?? ""}`.toLowerCase().includes(q),
  );

  /** Modos com texto passam pela revisão; só fotos sai direto. */
  async function aoClicarEnviar(v: Veiculo) {
    if (modo === "fotos") return void enviar(v);
    setEnviando(v.id);
    try {
      const r = await apiClient.post<{ data: Preparado }>(`/api/v1/veiculos/${v.id}/preparar-envio`, {
        conversation_id: conversationId,
        modo,
        previa: true,
      });
      setRevisao({ veiculo: v, texto: r.data.itens[0]?.body ?? "" });
    } catch (e) {
      showApiError(e);
    } finally {
      setEnviando(null);
    }
  }

  async function enviar(v: Veiculo, texto?: string) {
    setEnviando(v.id);
    try {
      const r = await apiClient.post<{ data: Preparado }>(
        `/api/v1/veiculos/${v.id}/preparar-envio`,
        { conversation_id: conversationId, modo, com_video: comVideo, ...(texto ? { texto } : {}) },
      );
      const { itens, fotos_faltando } = r.data;
      for (let i = 0; i < itens.length; i++) {
        const it = itens[i]!;
        await send.mutateAsync({
          conversation_id: conversationId,
          type: it.type,
          body: it.body ?? undefined,
          media_storage_path: it.media_storage_path,
          media_mime: it.media_mime,
          metadata: { veiculo_id: v.id },
        });
        if (i < itens.length - 1) await dormir(PAUSA_ENTRE_ITENS_MS);
      }
      toast.success(`${t("Enviado")}: ${tituloDoVeiculo(v)}`);
      if (fotos_faltando) toast.warning(t("Algumas fotos não puderam ser enviadas."));
      aoFechar();
    } catch (e) {
      showApiError(e);
    } finally {
      setEnviando(null);
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(a) => !a && !enviando && aoFechar()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Enviar veículo ao cliente")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {MODOS.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant={modo === m.id ? "default" : "outline"}
                onClick={() => setModo(m.id)}
              >
                {t(m.rotulo)}
              </Button>
            ))}
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={comVideo} onChange={(e) => setComVideo(e.target.checked)} />
              {t("com vídeo")}
            </label>
          </div>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("Buscar modelo, marca ou código")}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
          <ul className="space-y-2">
            {lista.isPending ? <li className="text-sm text-muted-foreground">{t("Carregando…")}</li> : null}
            {!lista.isPending && veiculos.length === 0 ? (
              <li className="text-sm text-muted-foreground">{t("Nenhum veículo disponível.")}</li>
            ) : null}
            {veiculos.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                {v.capa_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.capa_url} alt="" className="h-14 w-20 shrink-0 rounded object-cover" />
                ) : (
                  <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                    {t("Sem foto")}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{tituloDoVeiculo(v)}</div>
                  <div className="text-muted-foreground">
                    {formatarPreco(v.preco_cents, v.moeda)} · {v.fotos.length} {t("foto(s)")}
                  </div>
                </div>
                <Button size="sm" disabled={enviando !== null} onClick={() => void aoClicarEnviar(v)}>
                  {enviando === v.id ? t("Enviando…") : t("Enviar")}
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      {revisao ? (
        <Dialog open onOpenChange={(a) => !a && !enviando && setRevisao(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("Conferir ficha antes de enviar")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{tituloDoVeiculo(revisao.veiculo)}</p>
            <textarea
              value={revisao.texto}
              onChange={(e) => setRevisao({ ...revisao, texto: e.target.value })}
              rows={12}
              maxLength={4096}
              className="w-full rounded-md border bg-background p-3 text-sm"
              data-testid="ficha-editavel"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={enviando !== null} onClick={() => setRevisao(null)}>
                {t("Voltar")}
              </Button>
              <Button
                size="sm"
                disabled={enviando !== null || revisao.texto.trim() === ""}
                onClick={() => void enviar(revisao.veiculo, revisao.texto.trim())}
              >
                {enviando ? t("Enviando…") : t("Enviar")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
