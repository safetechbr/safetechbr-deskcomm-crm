import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Apaga de verdade o histórico de atendimento de UM canal: mensagens, chamadas de
 * voz e conversas. É a saída opt-in do operador ao remover o canal — quando ele
 * responde "sim" à pergunta "também excluir as conversas?". Sem esse "sim", o
 * canal é só arquivado e o histórico fica (comportamento de sempre).
 *
 * Contatos NÃO são tocados: um contato pode ter venda registrada no PDV.
 *
 * Roda com o cliente admin, então o filtro de `organization_id` é nosso e vem
 * SEMPRE da sessão. A ordem respeita as FKs RESTRICT para `channel_sessions`
 * (messages, voice_calls, conversations); as demais tabelas penduradas em
 * conversations/messages são CASCADE ou SET NULL (conferido no catálogo).
 */
export interface HistoricoApagado {
  mensagens: number;
  chamadas_de_voz: number;
  conversas: number;
}

export async function apagarHistoricoDoCanal(
  admin: SupabaseClient,
  orgId: string,
  channelSessionId: string,
): Promise<HistoricoApagado> {
  const apagar = async (tabela: "messages" | "voice_calls" | "conversations") => {
    const { count, error } = await admin
      .from(tabela)
      .delete({ count: "exact" })
      .eq("organization_id", orgId)
      .eq("channel_session_id", channelSessionId);
    if (error) throw new Error(`Não foi possível apagar ${tabela}: ${error.message}`);
    return count ?? 0;
  };
  const mensagens = await apagar("messages");
  const chamadas_de_voz = await apagar("voice_calls");
  const conversas = await apagar("conversations");
  return { mensagens, chamadas_de_voz, conversas };
}
