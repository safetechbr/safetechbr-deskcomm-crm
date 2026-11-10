"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useUser, useActiveOrg } from "@/hooks/auth/AuthProvider";
import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";
import { roleAtLeast } from "@/lib/auth/types";
import { bloqueioDoVeiculo, reservaAtiva, type ReservaDeVeiculo } from "@/lib/veiculos/reservas";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBlocoRecolhivel } from "@/hooks/inbox/useBlocoRecolhivel";
import { CaretDown, CaretRight } from "@/lib/ui/icons";
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

type VeiculoComCapa = Veiculo & { capa_url?: string | null; reserva?: ReservaDeVeiculo | null };

const MODOS: Array<{ id: ModoDeEnvio; rotulo: string }> = [
  { id: "completo", rotulo: "Fotos + ficha" },
  { id: "fotos", rotulo: "Só fotos" },
  { id: "ficha", rotulo: "Só ficha" },
  { id: "preco", rotulo: "Só preço" },
];

const PAUSA_ENTRE_ITENS_MS = 1500;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CHAVE_RECOLHIDO = "deskcomm:inbox:estoque-da-conversa:recolhido";

/**
 * "Estoque" no painel lateral da conversa: bloco recolhível (recolhido de
 * fábrica) com a lista de veículos disponíveis e o envio em um clique.
 *
 * Não existe caminho de envio novo: a rota `preparar-envio` só copia as mídias
 * para a pasta da conversa e devolve a lista; cada item sai por
 * `useSendMessage` (`/api/v1/messages`), então canal, janela de 24 h, opt-out e
 * limites valem como em qualquer mensagem. Os dados só são buscados com o
 * bloco aberto.
 */
export function EstoqueDaConversa({ conversationId }: { conversationId: string }) {
  const t = useT();
  const [recolhido, definirRecolhido] = useBlocoRecolhivel(CHAVE_RECOLHIDO, true);
  const Seta = recolhido ? CaretRight : CaretDown;
  return (
    <section
      className="rounded-lg border border-border bg-surface"
      data-testid="estoque-da-conversa"
      aria-label={t("Estoque")}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-expanded={!recolhido}
        aria-controls="estoque-da-conversa-corpo"
        title={recolhido ? t("Mostrar estoque") : t("Recolher estoque")}
        onClick={() => definirRecolhido(!recolhido)}
        data-testid="estoque-da-conversa-alternar"
      >
        <span>{t("Estoque")}</span>
        <Seta size={14} aria-hidden />
      </button>
      <div
        id="estoque-da-conversa-corpo"
        hidden={recolhido}
        className="border-t border-border/60 p-3"
      >
        {recolhido ? null : <CorpoDoEstoque conversationId={conversationId} />}
      </div>
    </section>
  );
}

function CorpoDoEstoque({ conversationId }: { conversationId: string }) {
  const t = useT();
  const send = useSendMessage();
  const usuario = useUser();
  const org = useActiveOrg();
  const qc = useQueryClient();
  const [reservando, setReservando] = useState<VeiculoComCapa | null>(null);
  const [horas, setHoras] = useState(24);
  const [visita, setVisita] = useState("");
  const [salvandoReserva, setSalvandoReserva] = useState(false);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["veiculos"] });
  useRealtimeChannel({ name: `reservas-estoque-${org?.orgId}`, enabled: !!org?.orgId,
    postgresChanges: { event: "*", table: "reservas_de_veiculo", filter: `organization_id=eq.${org?.orgId}` },
    onChange: () => { void recarregar(); },
  });
  async function salvarReserva() {
    if (!reservando) return;
    setSalvandoReserva(true);
    try {
      await apiClient.post(`/api/v1/veiculos/${reservando.id}/reserva`, {
        conversation_id: conversationId, duracao_horas: horas,
        ...(visita ? { visita_em: new Date(visita).toISOString() } : {}),
      });
      await recarregar(); setReservando(null);
      toast.success(t("Veículo reservado. O prazo começa agora."));
    } catch (e) { showApiError(e); await recarregar(); }
    finally { setSalvandoReserva(false); }
  }
  async function liberar(v: VeiculoComCapa) {
    if (!v.reserva) return;
    setSalvandoReserva(true);
    try {
      await apiClient.delete(`/api/v1/veiculos/${v.id}/reserva`, { reserva_id: v.reserva.id });
      await recarregar(); toast.success(t("Reserva liberada. Veículo disponível para a equipe."));
    } catch (e) { showApiError(e); await recarregar(); }
    finally { setSalvandoReserva(false); }
  }
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<ModoDeEnvio>("completo");
  const [comVideo, setComVideo] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  // Ficha em revisão: o atendente confere/edita o texto antes de sair.
  const [revisao, setRevisao] = useState<{ veiculo: Veiculo; texto: string } | null>(null);

  const lista = useQuery({
    queryKey: ["veiculos", "central", org?.orgId],
    queryFn: async () => {
      const r = await apiClient.get<{ data: VeiculoComCapa[] }>(
        "/api/v1/veiculos?capas=1",
      );
      return r.data.filter(v => v.status !== "vendido");
    },
    staleTime: 0,
    refetchInterval: 5_000,
  });

  const q = busca.trim().toLowerCase();
  const veiculos = (lista.data ?? []).filter(
    (v) => !q || `${v.codigo} ${tituloDoVeiculo(v)} ${v.cor ?? ""}`.toLowerCase().includes(q),
  );

  /** Modos com texto passam pela revisão; só fotos sai direto. */
  async function aoClicarEnviar(v: VeiculoComCapa) {
    if (bloqueioDoVeiculo(v.status, v.reserva, usuario.id)) return;
    if (modo === "fotos") return void enviar(v);
    setEnviando(v.id);
    try {
      const r = await apiClient.post<{ data: Preparado }>(
        `/api/v1/veiculos/${v.id}/preparar-envio`,
        {
          conversation_id: conversationId,
          modo,
          previa: true,
        },
      );
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
      setRevisao(null);
    } catch (e) {
      showApiError(e);
    } finally {
      setEnviando(null);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {MODOS.map((m) => (
            <Button
              key={m.id}
              type="button"
              size="sm"
              variant={modo === m.id ? "default" : "outline"}
              aria-pressed={modo === m.id}
              onClick={() => setModo(m.id)}
            >
              {t(m.rotulo)}
            </Button>
          ))}
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={comVideo}
              onChange={(e) => setComVideo(e.target.checked)}
            />
            {t("com vídeo")}
          </label>
        </div>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={t("Buscar modelo, marca ou código")}
          className="h-8 w-full rounded-md border bg-background px-3 text-sm"
        />
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {lista.isPending ? (
            <li className="text-sm text-muted-foreground">{t("Carregando…")}</li>
          ) : null}
          {lista.isError ? <li role="alert" className="text-sm text-destructive">{t("Não foi possível conferir o estoque e as reservas.")} <button onClick={() => void lista.refetch()}>{t("Tentar novamente")}</button></li> : null}
          {!lista.isPending && !lista.isError && veiculos.length === 0 ? (
            <li className="text-sm text-muted-foreground">{t("Nenhum veículo disponível.")}</li>
          ) : null}
          {veiculos.map((v) => (
            <li key={v.id} className="flex flex-col gap-2 rounded-md border p-2 text-sm">
              <div className="flex items-center gap-2">
                {v.capa_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.capa_url}
                    alt=""
                    className="h-12 w-16 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                    {t("Sem foto")}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{tituloDoVeiculo(v)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatarPreco(v.preco_cents, v.moeda)} · {v.fotos.length} {t("foto(s)")}
                  </div>
                </div>
              </div>
              {reservaAtiva(v.reserva) ? (
                <div role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                  <strong>{t("Reservado por")} {v.reserva.vendedor_nome || t("vendedor responsável")}{v.reserva.vendedor_user_id === usuario.id ? ` (${t("você")})` : ""}</strong>
                  <div>{t("Até")} {new Date(v.reserva.expira_em).toLocaleString("pt-BR")}</div>
                  {v.reserva.visita_em ? <div>{t("Visita")}: {new Date(v.reserva.visita_em).toLocaleString("pt-BR")}</div> : null}
                  {v.reserva.vendedor_user_id === usuario.id || roleAtLeast(org?.role, "manager") ? (
                    <Button size="sm" variant="ghost" disabled={salvandoReserva} onClick={() => void liberar(v)}>{t("Liberar reserva")}</Button>
                  ) : <p>{t("Envio de fotos, vídeo e ficha bloqueado durante a reserva.")}</p>}
                </div>
              ) : v.status === "disponivel" && roleAtLeast(org?.role, "agent") ? (
                <Button size="sm" variant="outline" disabled={salvandoReserva} onClick={() => { setReservando(v); setHoras(24); setVisita(""); }}>{t("Reservar para visita")}</Button>
              ) : v.status !== "disponivel" ? <p className="text-xs text-muted-foreground">{t("Indisponível no estoque")}</p> : null}
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                title={bloqueioDoVeiculo(v.status, v.reserva, usuario.id) ?? undefined}
                disabled={enviando !== null || !!bloqueioDoVeiculo(v.status, v.reserva, usuario.id)}
                onClick={() => void aoClicarEnviar(v)}
              >
                {enviando === v.id ? t("Enviando…") : t("Enviar")}
              </Button>
            </li>
          ))}
        </ul>
      </div>
      {reservando ? (
        <Dialog open onOpenChange={(aberto) => !aberto && !salvandoReserva && setReservando(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("Reservar veículo para visita")}</DialogTitle></DialogHeader>
            <p className="text-sm">{tituloDoVeiculo(reservando)}</p>
            <p className="text-sm text-muted-foreground">{t("A reserva ficará em seu nome. Ao vencer, o veículo volta automaticamente a ficar disponível para os outros vendedores.")}</p>
            <label className="grid gap-1 text-sm">{t("Prazo da reserva (horas)")}
              <input type="number" min={1} max={24} value={horas} onChange={e => setHoras(Number(e.target.value))} className="rounded-md border bg-background p-2" />
            </label>
            <label className="grid gap-1 text-sm">{t("Horário da visita (opcional)")}
              <input type="datetime-local" value={visita} onChange={e => setVisita(e.target.value)} className="rounded-md border bg-background p-2" />
            </label>
            <p className="text-xs text-muted-foreground">{t("Prazo máximo: 24 horas. A visita deve ocorrer dentro desse período.")}</p>
            <Button disabled={salvandoReserva || horas < 1 || horas > 24 || !Number.isInteger(horas)} onClick={() => void salvarReserva()}>{salvandoReserva ? t("Salvando…") : t("Confirmar reserva")}</Button>
          </DialogContent>
        </Dialog>
      ) : null}
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
              <Button
                variant="outline"
                size="sm"
                disabled={enviando !== null}
                onClick={() => setRevisao(null)}
              >
                {t("Voltar")}
              </Button>
              <Button
                size="sm"
                disabled={enviando !== null || revisao.texto.trim() === "" || !!bloqueioDoVeiculo((lista.data?.find(v => v.id === revisao.veiculo.id) ?? revisao.veiculo).status, lista.data?.find(v => v.id === revisao.veiculo.id)?.reserva, usuario.id)}
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
