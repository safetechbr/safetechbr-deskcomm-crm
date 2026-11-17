import type { SupabaseClient } from "@supabase/supabase-js";

import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { apagarHistoricoDoCanal, type HistoricoApagado } from "./apagar-historico";

/**
 * CONVERSAS QUE SOBRARAM DE CANAIS JÁ REMOVIDOS.
 *
 * Excluir um canal que tem histórico só o ARQUIVA (`archived_at`) e, se o operador
 * não marcou "também excluir as conversas", as conversas ficam penduradas nele.
 * Esta é a limpeza dessas sobras — e SÓ delas: canal ativo, pausado ou
 * desconectado-mas-vivo nunca entra (a condição é `archived_at is not null`), e
 * conversa sem canal (grupo etc.) também não.
 *
 * Roda com o cliente admin: o filtro de `organization_id` é nosso e vem SEMPRE da
 * sessão do chamador.
 */
export interface CanalRemovidoComSobra {
  id: string;
  provider: string;
  nome: string;
  conversas: number;
  mensagens: number;
}

interface LinhaDoCanal {
  id: string;
  provider: string;
  display_name: string | null;
  phone_number: string | null;
}

export async function listarSobrasDeCanaisRemovidos(
  admin: SupabaseClient,
  orgId: string,
): Promise<CanalRemovidoComSobra[]> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select("id, provider, display_name, phone_number")
    .eq("organization_id", orgId)
    .not("archived_at", "is", null);
  if (error) throw new Error(`Não foi possível ler os canais removidos: ${error.message}`);

  const contar = async (tabela: "conversations" | "messages", id: string) => {
    const { count, error: e } = await admin
      .from(tabela)
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("channel_session_id", id);
    if (e) throw new Error(`Não foi possível contar ${tabela}: ${e.message}`);
    return count ?? 0;
  };

  const canais = await Promise.all(
    ((data ?? []) as LinhaDoCanal[]).map(async (c) => ({
      id: c.id,
      provider: c.provider,
      nome: nomeDoContato({ display_name: c.display_name }) ?? (c.phone_number?.trim() || c.provider),
      conversas: await contar("conversations", c.id),
      mensagens: await contar("messages", c.id),
    })),
  );
  return canais.filter((c) => c.conversas > 0).sort((a, b) => b.conversas - a.conversas);
}

export interface SobrasApagadas {
  canais: number;
  total: HistoricoApagado;
}

/** Apaga as conversas dos canais removidos. Repetir é inofensivo: sem sobra, não faz nada. */
export async function apagarSobrasDeCanaisRemovidos(
  admin: SupabaseClient,
  orgId: string,
): Promise<SobrasApagadas> {
  const sobras = await listarSobrasDeCanaisRemovidos(admin, orgId);
  const total: HistoricoApagado = { mensagens: 0, chamadas_de_voz: 0, conversas: 0 };
  for (const canal of sobras) {
    const feito = await apagarHistoricoDoCanal(admin, orgId, canal.id);
    total.mensagens += feito.mensagens;
    total.chamadas_de_voz += feito.chamadas_de_voz;
    total.conversas += feito.conversas;
  }
  return { canais: sobras.length, total };
}
