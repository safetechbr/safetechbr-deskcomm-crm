"use client";
import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useConversation, isNotFound } from "@/hooks/inbox/useConversation";
import { useMarkAsRead } from "@/hooks/inbox/useMarkAsRead";
import { useParticipantesDaConversa } from "@/hooks/inbox/useParticipantesDaConversa";
import { estadoDaJanela } from "@/lib/channels/janela";
import { motivoDaJanelaFechada, motivoDoContato } from "@/lib/inbox/motivo-do-envio-bloqueado";
import { composerBloqueadoAteAssumir } from "@/lib/inbox/bloqueio-ate-assumir";
import type { Message } from "@/lib/types/messaging";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ChatThread } from "@/components/inbox/ChatThread";
import { Composer } from "@/components/inbox/Composer";
import { ConversationHeader } from "@/components/inbox/ConversationHeader";
import { JanelaFechadaAviso } from "@/components/inbox/JanelaFechadaAviso";

/**
 * O chat do negócio numa gaveta lateral, sem sair do Kanban.
 *
 * Reaproveita as MESMAS peças do Inbox (cabeçalho, fio, aviso de janela e
 * compositor) em vez de uma segunda caixa de resposta: o que o atendente vê e as
 * regras de envio (janela fechada, contato bloqueado, "assumir antes de
 * responder", somente leitura) são as do Inbox porque o código é o mesmo.
 *
 * Fica de fora o que só faz sentido na tela cheia: busca no fio, encaminhar e
 * rascunho sugerido por URL. Para isso há o botão "Abrir no Inbox".
 */
export function ChatLateralDoLead({
  conversationId,
  titulo,
  onFechar,
  onVerNegocio,
}: {
  conversationId: string;
  titulo: string;
  onFechar: () => void;
  /** Abre o dossiê do negócio — o que o clique no card fazia antes. */
  onVerNegocio: () => void;
}) {
  const t = useT();
  const { activeOrg, user } = useAuth();
  const supportReadonly = user.support?.access_mode === "support_readonly";
  const conversa = useConversation(conversationId, true);
  const c = conversa.data ?? null;
  const [respondendo, setRespondendo] = useState<Message | null>(null);
  const [agora] = useState(() => new Date());
  const participantes = useParticipantesDaConversa(c?.id ?? "");
  const participa = participantes.data?.some((p) => p.user_id === user.id) === true;

  useMarkAsRead(c?.id ?? null, c?.unread_count_for_assignee ?? 0);

  const provider = c?.channel_sessions?.provider ?? null;
  const motivoDaJanela = c
    ? motivoDaJanelaFechada(estadoDaJanela(provider, c.last_inbound_at ?? null, agora), provider, t)
    : null;
  const blockedReason = c ? motivoDoContato(c.contacts, t) : null;

  return (
    <Sheet open onOpenChange={(aberto) => !aberto && onFechar()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
        // O foco vai para o compositor (que é o que o atendente quer), não para
        // o botão de fechar.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetTitle className="sr-only">{`${t("Conversa")}: ${titulo}`}</SheetTitle>
        {c ? (
          <>
            <div className="pr-10">
              <ConversationHeader key={c.id} conversation={c} />
            </div>
            <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
              <Button variant="ghost" size="sm" onClick={onVerNegocio}>
                {t("Ver negócio")}
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <a href={`/app/inbox?id=${c.id}`}>{t("Abrir no Inbox")}</a>
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <ChatThread
                conversationId={c.id}
                provider={provider}
                onResponder={setRespondendo}
                dono={{
                  userId: c.assigned_to_user_id ?? null,
                  nome: c.assigned_to_user_name ?? null,
                }}
                contatoId={c.contacts?.id ?? null}
              />
            </div>
            {motivoDaJanela && (
              <JanelaFechadaAviso
                conversationId={c.id}
                provider={provider}
                motivo={motivoDaJanela}
              />
            )}
            <Composer
              conversationId={c.id}
              blockedReason={supportReadonly ? "Acompanhamento somente leitura" : blockedReason}
              janelaFechada={motivoDaJanela}
              disabled={c.status === "closed"}
              aguardandoAssumir={composerBloqueadoAteAssumir({
                ligada: activeOrg?.interface_settings?.bloquearAteAssumir === true,
                donoDaConversa: c.assigned_to_user_id,
                atendenteId: user.id,
                participanteAtivo: participa,
              })}
              contactName={c.contacts?.name ?? null}
              contactDisplayName={c.contacts?.display_name}
              respondendo={respondendo}
              onCancelarResposta={() => setRespondendo(null)}
              currentContactId={c.contact_id}
              usuarioId={user.id}
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {conversa.isPending
              ? t("Carregando conversa…")
              : isNotFound(conversa.error)
                ? t("Conversa não encontrada ou fora do seu acesso.")
                : t("Não foi possível carregar a conversa.")}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
