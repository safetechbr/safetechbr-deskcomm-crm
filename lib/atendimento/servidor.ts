import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api/types";
import type { Conversation } from "@/lib/types/messaging";

const RECUSAS: Record<string, [number, string]> = {
  permissao_negada: [403, "Você não pode alterar este atendimento."],
  nao_encontrado: [404, "Cliente ou conversa não encontrado nesta empresa."],
  conflito: [409, "O responsável mudou. Atualize a conversa e tente novamente."],
  somente_responsavel: [403, "Somente o vendedor responsável pode liberar este atendimento."],
  senha_necessaria: [403, "Informe a senha administrativa para assumir este atendimento."],
  senha_nao_configurada: [
    403,
    "Peça ao administrador para configurar a senha de troca de atendimento em Segurança.",
  ],
  senha_incorreta: [403, "Senha administrativa incorreta."],
  tentativas_excedidas: [429, "Limite de tentativas atingido. Tente novamente em 15 minutos."],
};

export interface ResultadoAtendimento {
  conversation: Conversation | null;
  dono_user_id: string | null;
  antes: string | null;
  autorizado_por_senha: boolean;
}

/** Ator e empresa vêm exclusivamente da sessão autorizada, nunca do corpo HTTP. */
export async function alterarAtendimento(p: {
  orgId: string;
  actorId: string;
  contactId?: string | null;
  conversationId?: string;
  acao: "assumir" | "liberar";
  senha?: string;
  expected?: string | null;
}): Promise<ResultadoAtendimento> {
  const admin = createAdminClient();
  let contactId = p.contactId ?? null;
  if (p.conversationId) {
    const { data, error } = await admin
      .from("conversations")
      .select("contact_id")
      .eq("id", p.conversationId)
      .eq("organization_id", p.orgId)
      .maybeSingle();
    if (error || !data)
      throw new ApiError(404, "not_found", undefined, "", "Conversa não encontrada.");
    contactId = data.contact_id;
  }
  const { data, error } = await admin.rpc("fn_atendimento_alterar", {
    p_org: p.orgId,
    p_actor: p.actorId,
    p_contact: contactId,
    p_conversation: p.conversationId ?? null,
    p_acao: p.acao,
    p_senha: p.senha ?? null,
    p_expected: p.expected ?? null,
  });
  if (error)
    throw new ApiError(
      500,
      "internal_error",
      undefined,
      "",
      "Não foi possível alterar o atendimento.",
    );
  const resultado = data as unknown as ResultadoAtendimento & { erro?: string };
  if (resultado.erro) {
    const [status, mensagem] = RECUSAS[resultado.erro] ?? [422, "Operação inválida."];
    throw new ApiError(status, `atendimento_${resultado.erro}`, undefined, "", mensagem);
  }
  return resultado;
}
