"use client";
import type { ReactNode } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Badge } from "@/components/ui/badge";
import { JanelaSelo } from "@/components/inbox/JanelaSelo";
import { ChannelLogo } from "@/components/inbox/ChannelLogo";
import { Phone } from "@/lib/ui/icons";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useAutomaticoAtivo } from "@/hooks/ai/useAutomaticoAtivo";
import { OwnerBadge } from "@/components/kanban/OwnerBadge";
import { FaixaDaCarteira } from "@/components/inbox/FaixaDaCarteira";
import { comandoDaConversa, ROTULO_DO_MOTIVO } from "@/lib/inbox/comando-da-conversa";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { rotuloParaAEquipe } from "@/lib/contacts/rotulo-do-contato";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import { rotuloDoCanalDaConversa } from "@/lib/channels/estado";

interface Props {
  conversation: ConversationWithContact;
  acaoDaFicha?: ReactNode;
}

/**
 * O CHIP NOMEIA CICLO DE VIDA, NÃO COMANDO.
 *
 * Ele afirmava quem manda — "Automático atendendo", "Aguardando atendente" — a
 * 20px de um selo que responde a MESMA pergunta por outra fonte, e as duas se
 * contradiziam na tela: `conversations.status` não acompanha silêncio, trava de
 * contato nem atribuição, e o motor nunca o lê. Medido em 2026-08-30 num print
 * do dono: "Aguardando atendente" e "Automático" no mesmo cabeçalho.
 *
 * Quem responde "quem manda" é o `OwnerBadge`, que vem de `comandoDaConversa`.
 * Aqui fica só o que o status realmente sabe: o episódio está aberto ou acabou.
 *
 * Cobre os SETE valores do CHECK de propósito — o call site é
 * `t(STATUS_LABEL[status] ?? status)`, e um buraco imprime o token cru em inglês
 * no rosto do atendente. Vigiado pelo invariante de espelho.
 */
const STATUS_LABEL: Record<string, string> = {
  open: "Aberta",
  pending: "Aberta",
  claimed: "Aberta",
  ai_handling: "Aberta",
  resolved: "Resolvida",
  closed: "Fechada",
  archived: "Arquivada",
};

/**
 * Cabeçalho da conversa: só identidade e estado. As AÇÕES (assumir, transferir,
 * fechar, buscar…) moraram aqui e foram para o bloco recolhível
 * `AcoesDaConversa`, no painel lateral direito — o fio fica com a altura toda.
 */
export function ConversationHeader({ conversation, acaoDaFicha }: Props) {
  const t = useT();
  const { user } = useAuth();
  const automaticoDaOrg = useAutomaticoAtivo();

  const c = conversation.contacts ?? null;
  const displayName = rotuloParaAEquipe(c, t);
  /** Por onde esta conversa entrou — o mesmo rótulo da lista (#2383). */
  const rotuloCanal = rotuloDoCanalDaConversa(conversation.channel_sessions, t);
  const phone = c?.phone_number ? phoneForDisplay(c.phone_number) : null;
  const status = conversation.status;

  // Quem manda: uma pergunta, uma fonte (`comandoDaConversa`).
  const { comando, motivo } = comandoDaConversa({
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
  });

  if (user.support?.access_mode === "support_readonly")
    return (
      <header className="flex items-center justify-between border-b p-4">
        <strong>{displayName}</strong>
        <span className="text-sm text-muted-foreground">
          {STATUS_LABEL[status] ?? status} · Somente leitura
        </span>
        {acaoDaFicha}
      </header>
    );
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 bg-surface px-3 py-2 md:px-4 md:py-3">
      {/* FAIXA DA CARTEIRA (#2591, regra 2): "este cliente pertence à carteira de
          A". `w-full` a põe numa linha própria acima da identidade, sem disputar
          espaço com a barra de ações — a faixa só existe quando o dono é OUTRA
          pessoa (o componente decide; sem carteira ele não desenha nada). */}
      {c?.id && (
        <FaixaDaCarteira contactId={c.id} quemAtendeId={conversation.assigned_to_user_id} />
      )}
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <ChannelLogo channel={conversation.channel_sessions} size={20} />
            <h2 className="min-w-0 truncate text-sm font-semibold" title={displayName}>
              {displayName}
            </h2>
            <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[10px]">
              {t(STATUS_LABEL[status] ?? status)}
            </Badge>
            {/* Ao lado do estado, não escondido num painel: a pergunta "dá para
                escrever agora?" se faz ANTES de digitar, não depois de receber um
                `failed` com um código de cinco dígitos. */}
            <JanelaSelo
              provider={conversation.channel_sessions?.provider ?? null}
              lastInboundAt={conversation.last_inbound_at}
            />
            {/* #2383: O CANAL DESTA CONVERSA, NO CABEÇALHO — a acepção que faltava
                da issue: a lista já dizia por onde a conversa entrou, a conversa
                ABERTA não dizia. O logo ao lado nomeia o provedor, não o número:
                com "Peças" e "Vendas" conectados, ele é idêntico nos dois casos.

                O TEXTO é o mesmo da lista e da tela `/app/connections`
                (`rotuloDoCanalDaConversa` → `nomeDoCanal`): uma segunda cadeia de
                regras aqui seria como as leituras de "quem manda" divergiram —
                três telas, um fato, uma fonte.

                `max-w` + `truncate` respondem ao critério de aceite "layout
                utilizável com nomes de canal maiores": o badge encolhe e o `title`
                devolve o texto inteiro. Sem canal (grupo, conversa sem sessão,
                não-WA) não há rótulo nenhum e esta barra fica exatamente como
                estava — o badge é acréscimo, não substituição. */}
            {rotuloCanal && (
              <Badge
                variant="outline"
                className="h-4 max-w-[9rem] min-w-0 truncate px-1.5 text-[10px]"
                title={`${t("Entrou por")} ${rotuloCanal}`}
                data-testid="canal-da-conversa"
              >
                <span className="truncate">{rotuloCanal}</span>
              </Badge>
            )}
          </div>

          {/* QUEM ESTÁ NO COMANDO, com nome e por GEOMETRIA — disco cheio para
              pessoa, anel vazado para o automático. É o mesmo componente do card do
              funil e do dossiê: um terceiro jeito de dizer "quem manda", por cor ou
              por texto, faria a mesma pergunta ter três respostas diferentes na
              mesma tela. Cor não sobrevive ao daltonismo nem ao teste do metro. */}
          <div className="mt-1 flex items-center gap-2" data-testid="comando-da-conversa">
            {comando.quem === "humano" ? (
              <OwnerBadge ownerKind="user" ownerName={comando.nome ?? t("Atendente")} />
            ) : comando.quem === "automatico" ? (
              <OwnerBadge ownerKind="ai" ownerName={t("Automático")} />
            ) : (
              // `ninguem`, `aguardando` e `encerrada` sem dono caem aqui: o disco
              // TRACEJADO do OwnerBadge, que é como o funil já desenha "ninguém".
              <OwnerBadge ownerKind={null} ownerName={null} />
            )}
          </div>
          {phone && (
            // No celular o telefone sai: cada linha do cabeçalho é altura tirada
            // do fio, e o número continua na Ficha.
            <p className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground max-md:hidden">
              <Phone size={11} weight="regular" aria-hidden /> {phone}
            </p>
          )}
        </div>
        {acaoDaFicha}
      </div>
      {/* O aviso pertence à operação automática. O testid é contrato:
          `escalacao-ciclo.spec.ts` o clica. */}
      {motivo !== null && (
        <Badge
          variant="outline"
          className="h-4 w-fit max-w-full truncate px-1.5 text-[10px]"
          title={t(ROTULO_DO_MOTIVO[motivo])}
          data-testid="badge-atendimento-humano"
        >
          {t(ROTULO_DO_MOTIVO[motivo])}
        </Badge>
      )}
    </div>
  );
}
