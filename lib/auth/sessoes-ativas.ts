import type { SupabaseClient } from "@supabase/supabase-js";

/** Uma linha de `fn_minhas_sessoes` (migration 9046). */
export interface SessaoAtiva {
  id: string;
  user_agent: string | null;
  ip: string | null;
  criada_em: string;
  ultima_atividade: string | null;
  /** É a sessão deste navegador. */
  atual: boolean;
}

/**
 * Sessões ativas da pessoa logada. PRECISA do client da sessão (não o admin):
 * a função filtra por `auth.uid()` e marca a atual pelo `session_id` do JWT.
 * Erro vira lista vazia — a tela segue com o "Sair de todos".
 */
export async function listarSessoesAtivas(supabase: SupabaseClient): Promise<SessaoAtiva[]> {
  const { data, error } = await supabase.rpc("fn_minhas_sessoes");
  if (error) return [];
  return (data ?? []) as SessaoAtiva[];
}
