"use client";
import { useState, type RefObject } from "react";
import Link from "next/link";
import { useT } from "@/hooks/i18n/useT";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, CaretDown, CaretRight, MagnifyingGlass } from "@/lib/ui/icons";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useBlocoRecolhivel } from "@/hooks/inbox/useBlocoRecolhivel";
import { useClaimConversation } from "@/hooks/inbox/useClaimConversation";
import { useReleaseConversation } from "@/hooks/inbox/useReleaseConversation";
import {
  useMarkPersonalContact,
  useUnmarkPersonalContact,
} from "@/hooks/contacts/usePersonalContact";
import { ROLE_RANK } from "@/lib/auth/types";
import {
  useArchiveConversation,
  useCloseConversation,
  useReopenConversation,
} from "@/hooks/inbox/useCloseConversation";
import { useResumeAiAttendance } from "@/hooks/inbox/useResumeAiAttendance";
import { usePauseAiAttendance } from "@/hooks/inbox/usePauseAiAttendance";
import { useAutomaticoAtivo } from "@/hooks/ai/useAutomaticoAtivo";
import { comandoDaConversa } from "@/lib/inbox/comando-da-conversa";
import { ReassignDialog } from "@/components/inbox/ReassignDialog";
import { SnoozeButton } from "@/components/inbox/SnoozeButton";
import { ParticipantesDaConversa } from "@/components/inbox/ParticipantesDaConversa";
import { DialButton } from "@/components/voice/DialButton";
import { VideoCallButton } from "@/components/inbox/VideoCallButton";
import { ReservarServicoNaConversa } from "@/components/agenda/ReservarServicoNaConversa";
import { motivoDoContato } from "@/lib/inbox/motivo-do-envio-bloqueado";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { rotuloParaAEquipe } from "@/lib/contacts/rotulo-do-contato";

interface Props {
  conversation: ConversationWithContact;
  /** A busca DENTRO da conversa: o ref devolve o foco ao botão quando o campo fecha. */
  onBuscar?: () => void;
  buscaAberta?: boolean;
  botaoBuscaRef?: RefObject<HTMLButtonElement | null>;
  /** Seleciona outra conversa no Inbox — a aba Número do Transferir abre a do outro número. */
  onAbrirConversa?: (id: string) => void;
}

const CHAVE_RECOLHIDO = "deskcomm:inbox:acoes-da-conversa:recolhido";

/**
 * AS AÇÕES DA CONVERSA, FORA DO CABEÇALHO.
 *
 * Moravam numa fileira de dez botões acima do fio e comiam altura da conversa.
 * Agora vivem num bloco recolhível do painel lateral — mesmos handlers, mesmos
 * rótulos, mesmos `data-testid` (contrato dos e2e). O estado aberto/recolhido
 * fica no navegador de quem atende.
 */
export function AcoesDaConversa({
  conversation,
  onAbrirConversa,
  onBuscar,
  buscaAberta,
  botaoBuscaRef,
}: Props) {
  const t = useT();
  const { user, activeOrg } = useAuth();
  const claim = useClaimConversation();
  const release = useReleaseConversation();
  const close = useCloseConversation();
  const reopen = useReopenConversation();
  const arquivar = useArchiveConversation();
  const retomar = useResumeAiAttendance();
  const pausar = usePauseAiAttendance();
  const automaticoDaOrg = useAutomaticoAtivo();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [confirmFecharOpen, setConfirmFecharOpen] = useState(false);
  const [confirmArquivarOpen, setConfirmArquivarOpen] = useState(false);
  const [confirmPessoalOpen, setConfirmPessoalOpen] = useState(false);
  const [recolhido, gravarRecolhido] = useBlocoRecolhivel(CHAVE_RECOLHIDO, false);

  const c = conversation.contacts ?? null;
  const displayName = rotuloParaAEquipe(c, t);
  const status = conversation.status;
  const isMineAssigned = conversation.assigned_to_user_id === user.id;
  const isOpen = status === "open" || conversation.assigned_to_user_id == null;
  const ehPessoal = c?.is_personal === true;
  const ehGestor =
    (user.is_platform_admin && !user.support) ||
    (activeOrg != null && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager);
  const podeMarcarPessoal = ehGestor;
  // Dono da conversa ou gestor+ — exatamente o gate da rota.
  const podeConvidar = isMineAssigned || ehGestor;
  const marcarPessoal = useMarkPersonalContact(c?.id ?? "");
  const desmarcarPessoal = useUnmarkPersonalContact(c?.id ?? "");

  const fatosDoComando = {
    status,
    assigned_to_user_id: conversation.assigned_to_user_id,
    assigned_to_user_name: conversation.assigned_to_user_name ?? null,
    assignee_kind: conversation.assignee_kind ?? null,
    bot_silenced_until: conversation.bot_silenced_until ?? null,
    last_handoff_reason: conversation.last_handoff_reason ?? null,
    force_human: c?.force_human ?? null,
    is_blocked: conversation.contacts?.is_blocked ?? null,
    is_group: conversation.is_group ?? false,
    automaticoDaOrg: automaticoDaOrg.data,
  };
  const { automaticoAtivo, travaVigente, motivo } = comandoDaConversa(fatosDoComando);
  // O que "Liberar" faz depende do estado: a guia não promete o automático
  // de volta quando ele não volta.
  const liberarDevolveAoAutomatico =
    comandoDaConversa({
      ...fatosDoComando,
      status: "open",
      assigned_to_user_id: null,
      assigned_to_user_name: null,
      assignee_kind: null,
      bot_silenced_until: conversation.last_handoff_at ? fatosDoComando.bot_silenced_until : null,
    }).comando.quem === "automatico";

  const encerrada = status === "closed" || status === "archived" || status === "resolved";
  // A volta aparece sempre que há algo a devolver, inclusive em conversa encerrada.
  const podeDevolver = travaVigente;
  // Pausar só existe quando é diferente de assumir: a conversa já tem dono
  // e o automático continua de pé.
  const podePausar = automaticoAtivo && !encerrada && conversation.assigned_to_user_id !== null;

  if (user.support?.access_mode === "support_readonly") return null;

  const Seta = recolhido ? CaretRight : CaretDown;

  return (
    <section
      className="rounded-lg border border-border bg-surface"
      data-testid="acoes-da-conversa"
      aria-label={t("Ações da conversa")}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-expanded={!recolhido}
        aria-controls="acoes-da-conversa-corpo"
        title={recolhido ? t("Mostrar ações") : t("Recolher ações")}
        onClick={() => gravarRecolhido(!recolhido)}
        data-testid="acoes-da-conversa-alternar"
      >
        <span>{t("Ações da conversa")}</span>
        <Seta size={14} aria-hidden />
      </button>
      <div
        id="acoes-da-conversa-corpo"
        hidden={recolhido}
        className="flex flex-col gap-2 border-t border-border/60 p-3"
      >
        {isOpen && !c?.id && (
          <Button
            size="sm"
            variant="default"
            className="w-full"
            disabled={claim.isPending}
            title={t("Você passa a responder esta conversa e o atendimento automático para aqui.")}
            onClick={() =>
              claim.mutate({
                conversation_id: conversation.id,
                expected_assignee: conversation.assigned_to_user_id,
              })
            }
          >
            {t("Assumir")}
          </Button>
        )}
        {isMineAssigned && !c?.id && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={release.isPending}
            // A guia vai em `title`, e NÃO em `aria-label`: o nome acessível
            // "Liberar" é o que os testes e os e2e procuram.
            title={
              liberarDevolveAoAutomatico
                ? t(
                    "Solta esta conversa: ela fica sem dono e o atendimento automático volta a responder.",
                  )
                : t(
                    "Solta esta conversa: ela fica sem dono e volta para a fila, esperando um atendente.",
                  )
            }
            onClick={() => release.mutate({ conversation_id: conversation.id })}
          >
            {t("Liberar")}
          </Button>
        )}
        {podeDevolver && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={retomar.isPending}
            data-testid="devolver-ao-automatico"
            title={
              motivo === "contato_travado"
                ? t(
                    "Religa o atendimento automático para este cliente — vale para todas as conversas dele.",
                  )
                : t("Devolve esta conversa ao atendimento automático.")
            }
            onClick={() => retomar.mutate({ conversation_id: conversation.id })}
          >
            {retomar.isPending ? t("Devolvendo...") : t("Devolver ao automático")}
          </Button>
        )}
        {podePausar && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={pausar.isPending}
            data-testid="pausar-o-automatico"
            title={t("O atendimento automático para nesta conversa. O dono não muda.")}
            onClick={() => pausar.mutate({ conversation_id: conversation.id })}
          >
            {pausar.isPending ? t("Pausando...") : t("Pausar o automático")}
          </Button>
        )}

        <div className="grid grid-cols-2 gap-2 [&_button]:w-full [&_button]:min-w-0 [&_button]:flex-1 [&_button]:justify-center">
          {onBuscar && (
            <Button
              ref={botaoBuscaRef}
              size="sm"
              variant="outline"
              onClick={onBuscar}
              aria-label={t("Buscar nesta conversa")}
              title={t("Buscar nesta conversa")}
              aria-expanded={buscaAberta}
            >
              <MagnifyingGlass size={16} aria-hidden />
              {t("Buscar")}
            </Button>
          )}
          {!conversation.is_group && c?.id && (
            <DialButton contactId={c.id} hasPhone={!!c.phone_number} />
          )}
          {!conversation.is_group &&
            c?.id &&
            activeOrg &&
            ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent && (
              <ReservarServicoNaConversa
                key={`${activeOrg.orgId}:${conversation.id}`}
                contactId={c.id}
                conversationId={conversation.id}
                contactName={displayName}
              />
            )}
          <VideoCallButton
            conversationId={conversation.id}
            provider={conversation.channel_sessions?.provider ?? null}
            lastInboundAt={conversation.last_inbound_at}
            bloqueio={motivoDoContato(c, t)}
            encerrada={status === "closed"}
          />
          <ParticipantesDaConversa
            conversationId={conversation.id}
            podeConvidar={podeConvidar}
            atendenteId={user.id}
          />
          {!encerrada && (!c?.id || onAbrirConversa) && (
            <Button
              size="sm"
              variant="outline"
              title={t(
                "Passa esta conversa para outro atendente. Se houver outro número conectado, dá para continuar o atendimento por ele.",
              )}
              onClick={() => setReassignOpen(true)}
            >
              {c?.id ? t("Outro número") : t("Transferir")}
            </Button>
          )}
          {!encerrada && (
            <SnoozeButton
              conversationId={conversation.id}
              snoozeUntil={conversation.snooze_until ?? null}
            />
          )}
          {!encerrada && (
            <Button
              size="sm"
              variant="outline"
              disabled={close.isPending}
              title={t("Encerra o atendimento. Depois você pode reabrir a conversa.")}
              onClick={() => setConfirmFecharOpen(true)}
            >
              {t("Fechar")}
            </Button>
          )}
          {encerrada && (
            <Button
              size="sm"
              variant="outline"
              disabled={reopen.isPending}
              title={t("Reabre o atendimento desta conversa, que estava encerrada.")}
              onClick={() =>
                reopen.mutate({
                  conversation_id: conversation.id,
                  expected_revision: conversation.service_revision,
                })
              }
            >
              {t("Reabrir")}
            </Button>
          )}
          {status !== "archived" && (
            <Button
              size="sm"
              variant="outline"
              disabled={arquivar.isPending}
              title={t(
                "Guarda a conversa na aba Arquivadas. Se ainda estiver aberta, o atendimento é encerrado.",
              )}
              onClick={() => setConfirmArquivarOpen(true)}
            >
              {arquivar.isPending ? t("Arquivando...") : t("Arquivar")}
            </Button>
          )}
          {podeMarcarPessoal && c?.id && !ehPessoal && (
            <Button
              size="sm"
              variant="outline"
              disabled={marcarPessoal.isPending}
              data-testid="marcar-pessoal"
              title={t("Tira este contato da operação: a conversa sai do inbox.")}
              onClick={() => setConfirmPessoalOpen(true)}
            >
              {t("Marcar como pessoal")}
            </Button>
          )}
          {podeMarcarPessoal && c?.id && ehPessoal && (
            <Button
              size="sm"
              variant="outline"
              disabled={desmarcarPessoal.isPending}
              data-testid="desmarcar-pessoal"
              title={t("Devolve este contato à operação: a conversa volta ao inbox.")}
              onClick={() => desmarcarPessoal.mutate()}
            >
              {desmarcarPessoal.isPending ? t("Desmarcando...") : t("Desmarcar pessoal")}
            </Button>
          )}
          {c?.id && (
            <Button asChild size="sm" variant="outline" className="col-span-2">
              <Link
                href={`/app/contacts/${c.id}`}
                className="flex w-full items-center justify-center gap-1"
                title={t("Abre a ficha completa deste contato.")}
              >
                {t("Ver contato")}
                <ArrowRight size={12} weight="regular" aria-hidden />
              </Link>
            </Button>
          )}
        </div>
      </div>

      <ReassignDialog
        conversationId={conversation.id}
        somenteNumero={!!c?.id}
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        numero={
          onAbrirConversa && c?.id
            ? {
                contactId: c.id,
                contactPhone: c.phone_number ?? null,
                channelSessionId: conversation.channel_session_id,
                onAbrirConversa,
              }
            : undefined
        }
      />
      <AlertDialog open={confirmFecharOpen} onOpenChange={setConfirmFecharOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Fechar esta conversa?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("O atendimento é encerrado. Se o cliente escrever de novo, você pode reabrir.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                close.mutate({
                  conversation_id: conversation.id,
                  expected_revision: conversation.service_revision,
                })
              }
            >
              {t("Fechar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* A descrição só aparece quando `!encerrada`: arquivar conversa aberta
          ENCERRA o atendimento (e desfaz a pausa do automático). */}
      <AlertDialog open={confirmArquivarOpen} onOpenChange={setConfirmArquivarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Arquivar esta conversa?")}</AlertDialogTitle>
            {!encerrada && (
              <AlertDialogDescription>
                {t(
                  "Arquivar encerra este atendimento e guarda a conversa no histórico. Se o cliente escrever de novo, ela volta.",
                )}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                arquivar.mutate({
                  conversation_id: conversation.id,
                  expected_revision: conversation.service_revision,
                })
              }
            >
              {t("Arquivar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmPessoalOpen} onOpenChange={setConfirmPessoalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Marcar este contato como pessoal?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "A conversa sai do inbox e o contato fica fora da operação: sem IA, sem follow-up, sem campanha e sem envio. O histórico continua no banco e volta à vista ao desmarcar; follow-ups e campanhas cancelados não voltam.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => marcarPessoal.mutate()}>
              {t("Marcar como pessoal")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
