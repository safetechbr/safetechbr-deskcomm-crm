/**
 * GET /api/v1/financeiro/resumo — saldo de cada conta e valor usado de cada cartão.
 *
 * Os dois são DERIVADOS por soma dos lançamentos em `fn_resumo_contas_e_cartoes`
 * (security invoker, a RLS decide o que se vê); nada disso é gravado.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type ResumoFinanceiro = {
  contas: { id: string; balance_cents: number }[];
  cartoes: { id: string; used_cents: number }[];
};

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "financeiro" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_resumo_contas_e_cartoes", {
    p_org: authz.org.orgId,
  });
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(data as unknown as ResumoFinanceiro, { requestId });
}
