import type { SupabaseClient } from "@supabase/supabase-js";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import { ApiError } from "@/lib/api/types";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";
import { bloqueioDoVeiculo, type ReservaDeVeiculo } from "./reservas";

export async function reservasAtivas(db: SupabaseClient, orgId: string, ids: string[], nomes = true) {
  if (!ids.length) return new Map<string, ReservaDeVeiculo>();
  const { data, error } = await db.from("reservas_de_veiculo").select("*")
    .eq("organization_id", orgId).in("veiculo_id", ids).is("encerrada_em", null)
    .gt("expira_em", new Date().toISOString());
  if (error) throw new Error("reservas_de_veiculo_leitura_falhou");
  const rows = (data ?? []) as ReservaDeVeiculo[];
  const rotulos = nomes ? await nomesDosAtendentes(rows.map(r => r.vendedor_user_id)) : new Map();
  return new Map(rows.map(r => [r.veiculo_id, { ...r, vendedor_nome: rotulos.get(r.vendedor_user_id) ?? null }]));
}

/** Também usado por cada mensagem: revisão/cópia feita antes da reserva não é autorização de envio. */
export async function conferirEnvioDeVeiculo(
  db: SupabaseClient, ctx: HandlerCtx, id: string,
) {
  const { data: v, error } = await db.from("veiculos").select("id,status")
    .eq("organization_id", ctx.organization_id).eq("id", id).maybeSingle();
  if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId);
  if (!v) throw new ApiError(404, "not_found", undefined, ctx.requestId);
  let reservas: Map<string, ReservaDeVeiculo>;
  try { reservas = await reservasAtivas(db, ctx.organization_id, [id]); }
  catch { throw new ApiError(500, "internal_error", undefined, ctx.requestId); }
  const motivo = bloqueioDoVeiculo(v.status, reservas.get(id), ctx.actor.type === "user" ? ctx.actor.id : null);
  if (motivo) throw new ApiError(409, "conflict", { veiculo_id: id }, ctx.requestId, motivo);
}
