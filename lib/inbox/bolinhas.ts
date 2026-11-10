import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

/** Quantas bolinhas cabem na doca antes de virar "+N". */
export const MAXIMO_DE_BOLINHAS = 5;

/** O que a bolinha mostra no lugar da foto, em ordem de preferência. */
export type ConteudoDaBolinha =
  { tipo: "foto"; src: string } | { tipo: "inicial"; texto: string } | { tipo: "aguardando" };

/**
 * A foto só existe quando há arquivo E o contato não foi anonimizado (LGPD).
 * Sem foto ou sem permissão, cai para a inicial; sem inicial (nome vazio ou só
 * símbolos/números), cai para o ícone de "aguardando".
 */
export function conteudoDaBolinha(
  contato: ConversationWithContact["contacts"],
  rotulo: string,
): ConteudoDaBolinha {
  if (contato?.id && contato.avatar_storage_path && !contato.is_anonymized) {
    return { tipo: "foto", src: `/api/v1/contacts/${contato.id}/avatar` };
  }
  const inicial = inicialDoNome(rotulo);
  return inicial ? { tipo: "inicial", texto: inicial } : { tipo: "aguardando" };
}

/** Primeira LETRA do nome. Dígitos (telefone) e símbolos não contam como inicial. */
export function inicialDoNome(nome: string | null | undefined): string | null {
  const m = (nome ?? "").trim().match(/\p{L}/u);
  return m ? m[0].toUpperCase() : null;
}

/** Dispensas guardadas: id da conversa → `last_message_at` no momento do "×". */
export type Dispensadas = Record<string, string>;

/**
 * Conversas que aparecem na doca: com mensagem não lida, não encerradas e não
 * dispensadas. Uma dispensa vale até chegar mensagem NOVA — o cliente que
 * escreve de novo volta a aparecer.
 */
export function bolinhasVisiveis(
  conversas: readonly ConversationWithContact[],
  dispensadas: Dispensadas,
): ConversationWithContact[] {
  return conversas
    .filter((c) => (c.unread_count_for_assignee ?? 0) > 0)
    .filter((c) => c.status !== "closed" && c.status !== "archived")
    .filter((c) => {
      const marca = dispensadas[c.id];
      return !marca || (c.last_message_at ?? "") > marca;
    })
    .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
}

export function textoDoContador(n: number): string {
  return n > 99 ? "99+" : String(n);
}
