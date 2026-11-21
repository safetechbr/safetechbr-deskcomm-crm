/** Prelúdio comum das rotas fiscais: suporte só leitura, papel e cliente admin (org vem da sessão). */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export type GuardaFiscal =
  | { ok: true; requestId: string; org: string; userId: string; admin: SupabaseClient }
  | { ok: false; response: Response };

export async function guardaFiscal(papel: "manager" | "agent", escrita: boolean): Promise<GuardaFiscal> {
  if (escrita) {
    const negado = await requireSupportWrite();
    if (negado) return { ok: false, response: negado };
  }
  const requestId = randomUUID();
  const authz = await requireRole(papel, { requestId, resource: "fiscal" });
  if (!authz.ok) return { ok: false, response: authz.response };
  return { ok: true, requestId, org: authz.org.orgId, userId: authz.user.id, admin: createAdminClient() };
}

export const COLUNAS_LISTA =
  "id, operacao, tipo, status, numero, serie, chave, valor_total_cents, data_emissao, ambiente, motivo_rejeicao, veiculo_id, negociacao_id, rascunho, autorizada_em, created_at";
