"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState } from "react";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useConversation } from "@/hooks/inbox/useConversation";
import { useMarkAsRead } from "@/hooks/inbox/useMarkAsRead";
import { OpenConversationProvider } from "@/hooks/notifications/OpenConversationContext";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import type { Message } from "@/lib/types/messaging";
import { estadoDaJanela } from "@/lib/channels/janela";
import { motivoDaJanelaFechada, motivoDoContato } from "@/lib/inbox/motivo-do-envio-bloqueado";
import { composerBloqueadoAteAssumir } from "@/lib/inbox/bloqueio-ate-assumir";
import { useParticipantesDaConversa } from "@/hooks/inbox/useParticipantesDaConversa";
import { ChatThread } from "../ChatThread";
import { Composer } from "../Composer";
import { ConversationHeader } from "../ConversationHeader";
import { CRMSidePanel } from "../CRMSidePanel";
import { JanelaFechadaAviso } from "../JanelaFechadaAviso";
import { RetentionNotice } from "../RetentionNotice";
import { X } from "@/lib/ui/icons";

interface Props {
  conversationId: string;
  /** A conversa já carregada pela doca (evita um GET extra). */
  inicial?: ConversationWithContact;
  onFechar: () => void;
  /** Abrir OUTRA conversa a partir da ficha (histórico do contato). */
  onAbrirConversa: (id: string) => void;
}

/**
 * A conversa numa janela por cima da página atual — só o fio, o compositor e a
 * ficha lateral com as automações. Não muda a rota: quem está no Financeiro
 * responde o cliente e continua no Financeiro.
 */
export function JanelaDaConversa({ conversationId, inicial, onFechar, onAbrirConversa }: Props) {
  const t = useT();
  const { user, activeOrg } = useAuth();
  const supportReadonly = user.support?.access_mode === "support_readonly";
  // O `inicial` serve o primeiro quadro; a busca única mantém a conversa viva
  // (status, dono) depois que a doca já não a lista.
  const single = useConversation(conversationId, true);
  const conversa = single.data ?? inicial ?? null;
  const participantes = useParticipantesDaConversa(conversationId);
  const participa = participantes.data?.some((p) => p.user_id === user.id) === true;
  const [respondendo, setRespondendo] = useState<Message | null>(null);

  useMarkAsRead(conversa?.id ?? null, conversa?.unread_count_for_assignee ?? 0);

  const janela = estadoDaJanela(
    conversa?.channel_sessions?.provider ?? null,
    conversa?.last_inbound_at ?? null,
    new Date(),
  );
  const motivoDaJanela = motivoDaJanelaFechada(janela, conversa?.channel_sessions?.provider, t);

  return (
    <DialogPrimitive.Root open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ds-cortina fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          data-testid="janela-da-conversa"
          aria-describedby={undefined}
          className="ds-modal fixed top-[50%] left-[50%] z-50 flex h-[min(46rem,92dvh)] w-[min(74rem,96vw)] translate-x-[-50%] translate-y-[-50%] overflow-hidden rounded-3xl border border-border/60 bg-surface shadow-xl"
        >
          <DialogPrimitive.Title className="sr-only">{t("Conversa")}</DialogPrimitive.Title>
          <OpenConversationProvider conversationId={conversationId}>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {conversa ? (
                <>
                  <ConversationHeader key={conversa.id} conversation={conversa} />
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <ChatThread
                      conversationId={conversa.id}
                      searchTerm=""
                      provider={conversa.channel_sessions?.provider ?? null}
                      onResponder={setRespondendo}
                      onEncaminhar={() => {}}
                      dono={{
                        userId: conversa.assigned_to_user_id ?? null,
                        nome: conversa.assigned_to_user_name ?? null,
                      }}
                      contatoId={conversa.contacts?.id ?? null}
                    />
                  </div>
                  <RetentionNotice conversationId={conversa.id} />
                  {motivoDaJanela && (
                    <JanelaFechadaAviso
                      conversationId={conversa.id}
                      provider={conversa.channel_sessions?.provider ?? null}
                      motivo={motivoDaJanela}
                    />
                  )}
                  <Composer
                    conversationId={conversa.id}
                    blockedReason={
                      supportReadonly
                        ? "Acompanhamento somente leitura"
                        : motivoDoContato(conversa.contacts, t)
                    }
                    janelaFechada={motivoDaJanela}
                    disabled={conversa.status === "closed"}
                    aguardandoAssumir={composerBloqueadoAteAssumir({
                      ligada: activeOrg?.interface_settings?.bloquearAteAssumir === true,
                      donoDaConversa: conversa.assigned_to_user_id,
                      atendenteId: user.id,
                      participanteAtivo: participa,
                    })}
                    contactName={conversa.contacts?.name ?? null}
                    contactDisplayName={conversa.contacts?.display_name}
                    respondendo={respondendo}
                    onCancelarResposta={() => setRespondendo(null)}
                    currentContactId={conversa.contact_id}
                    usuarioId={user.id}
                    rascunho={null}
                    initialDraft=""
                  />
                </>
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  {single.isError
                    ? t("Conversa não encontrada ou fora do seu acesso.")
                    : t("Carregando...")}
                </div>
              )}
            </div>
            <div className="hidden h-full min-h-0 w-[22rem] shrink-0 border-l border-border/60 lg:block">
              <CRMSidePanel conversation={conversa} onAbrirConversa={onAbrirConversa} />
            </div>
          </OpenConversationProvider>
          <DialogPrimitive.Close
            className="absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-full bg-surface-elevated/90 text-text-muted shadow-sm hover:text-foreground focus:ring-2 focus:ring-ring focus:outline-hidden"
            aria-label={t("Fechar")}
          >
            <X size={16} aria-hidden />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
