import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Apaga de verdade o histórico de atendimento de UM canal: os negócios (cards)
 * que nasceram das conversas dele, em qualquer funil, e depois mensagens,
 * chamadas de voz e conversas. É a saída opt-in do operador ao remover o canal —
 * quando ele responde "sim" à pergunta "também excluir as conversas?". Sem esse
 * "sim", o canal é só arquivado e o histórico fica (comportamento de sempre).
 *
 * Qual negócio é "do canal": o que tem a atividade `lead_created` gravada pelo
 * nascimento automático (`lib/leads/nascimento-do-lead.ts`, `source_module`
 * `canal.ingest`; linhas antigas `waha.ingest`) com `source_id` = uma conversa
 * deste canal — mais as retomadas (`retomado_de_lead_id`) desses negócios.
 * Negócio criado à mão, por formulário ou por outro canal NÃO entra, mesmo que
 * seja do mesmo contato. Os ids são lidos ANTES de apagar as conversas; as
 * filhas de `crm_leads` são CASCADE (atividades, links, scores...) ou SET NULL
 * (propostas, retomada).
 *
 * Contatos NÃO são tocados: um contato pode ter venda registrada no PDV.
 *
 * shortcut: sem transação (PostgREST não tem); a ordem é negócios → mensagens →
 * chamadas → conversas, então falha no meio deixa as conversas de pé e repetir
 * termina o serviço. Virar RPC transacional se precisar de atomicidade real.
 *
 * Roda com o cliente admin, então o filtro de `organization_id` é nosso e vem
 * SEMPRE da sessão. A ordem respeita as FKs RESTRICT para `channel_sessions`
 * (messages, voice_calls, conversations); as demais tabelas penduradas em
 * conversations/messages são CASCADE ou SET NULL (conferido no catálogo).
 */
export interface HistoricoApagado {
  negocios: number;
  mensagens: number;
  chamadas_de_voz: number;
  conversas: number;
}

const PAGINA = 1000;
const LOTE = 200; // ids por `.in()`, para a URL do PostgREST não estourar

function emLotes<T>(itens: T[]): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += LOTE) lotes.push(itens.slice(i, i + LOTE));
  return lotes;
}

async function idsDasConversas(admin: SupabaseClient, orgId: string, channelSessionId: string) {
  const ids: string[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await admin
      .from("conversations")
      .select("id")
      .eq("organization_id", orgId)
      .eq("channel_session_id", channelSessionId)
      .order("id")
      .range(de, de + PAGINA - 1);
    if (error) throw new Error(`Não foi possível ler conversations: ${error.message}`);
    ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    if ((data?.length ?? 0) < PAGINA) return ids;
  }
}

async function idsDosNegociosDoCanal(admin: SupabaseClient, orgId: string, conversas: string[]) {
  const negocios = new Set<string>();
  for (const lote of emLotes(conversas)) {
    const { data, error } = await admin
      .from("crm_lead_activities")
      .select("lead_id")
      .eq("organization_id", orgId)
      .eq("type", "lead_created")
      .in("source_module", ["canal.ingest", "waha.ingest"])
      .in("source_id", lote);
    if (error) throw new Error(`Não foi possível ler crm_lead_activities: ${error.message}`);
    for (const r of (data ?? []) as { lead_id: string }[]) negocios.add(r.lead_id);
  }
  // Retomadas: o negócio novo aberto a partir de um perdido do canal é do canal.
  let fronteira = [...negocios];
  while (fronteira.length) {
    const novos: string[] = [];
    for (const lote of emLotes(fronteira)) {
      const { data, error } = await admin
        .from("crm_leads")
        .select("id")
        .eq("organization_id", orgId)
        .in("retomado_de_lead_id", lote);
      if (error) throw new Error(`Não foi possível ler crm_leads: ${error.message}`);
      for (const r of (data ?? []) as { id: string }[])
        if (!negocios.has(r.id)) {
          negocios.add(r.id);
          novos.push(r.id);
        }
    }
    fronteira = novos;
  }
  return [...negocios];
}

export async function apagarHistoricoDoCanal(
  admin: SupabaseClient,
  orgId: string,
  channelSessionId: string,
): Promise<HistoricoApagado> {
  const conversasDoCanal = await idsDasConversas(admin, orgId, channelSessionId);
  const idsDosNegocios = await idsDosNegociosDoCanal(admin, orgId, conversasDoCanal);

  let negocios = 0;
  for (const lote of emLotes(idsDosNegocios)) {
    const { count, error } = await admin
      .from("crm_leads")
      .delete({ count: "exact" })
      .eq("organization_id", orgId)
      .in("id", lote);
    if (error) throw new Error(`Não foi possível apagar crm_leads: ${error.message}`);
    negocios += count ?? 0;
  }

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
  return { negocios, mensagens, chamadas_de_voz, conversas };
}
