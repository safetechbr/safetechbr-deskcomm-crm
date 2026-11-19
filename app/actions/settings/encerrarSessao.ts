"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

export type ResultadoDeEncerrarSessao =
  | { ok: true }
  | { ok: false; motivo: "invalida" | "sessao_atual" | "nao_encontrada" | "erro" };

/**
 * Encerra UMA sessão de outro aparelho (migration 9046). Pelo client da sessão:
 * é `auth.uid()` no corpo da função que limita às sessões da própria pessoa.
 * A sessão atual é recusada pelo banco — para ela existe "Sair".
 */
export async function encerrarSessao(sessaoId: string): Promise<ResultadoDeEncerrarSessao> {
  if (!z.string().uuid().safeParse(sessaoId).success) return { ok: false, motivo: "invalida" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, motivo: "erro" };

  const { data, error } = await supabase.rpc("fn_encerrar_minha_sessao", { p_sessao: sessaoId });
  if (error) return { ok: false, motivo: error.message.includes("sessao_atual") ? "sessao_atual" : "erro" };
  if (!data) return { ok: false, motivo: "nao_encontrada" };

  await audit({
    action: "auth.session_revoked",
    actorUserId: user.id,
    resourceType: "user",
    resourceId: user.id,
    metadata: { session_id: sessaoId },
    requestId: (await headers()).get("x-request-id"),
  });
  revalidatePath("/app/settings/security");
  return { ok: true };
}
