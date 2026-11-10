/**
 * GET /api/v1/financeiro/dashboard?de=&ate= — a matéria-prima do Dashboard.
 *
 * Devolve os lançamentos do período e TODOS os pendentes (atraso e previsão não
 * dependem do período). Pagina em blocos para não cair no teto de linhas do
 * PostgREST: métrica "precisa" não pode ser calculada sobre uma lista truncada.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import type { LancamentoDash } from "@/lib/financeiro/dashboard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLUNAS =
  "id, account_id, account_plan_id, card_id, direction, amount_cents, entry_date, due_date, status, paid_at";
const PAGINA = 1000;
const MAX_PAGINAS = 20;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export type DashboardFinanceiro = { periodo: LancamentoDash[]; pendentes: LancamentoDash[] };

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "financeiro" });
  if (!authz.ok) return authz.response;

  const url = new URL(req.url);
  const de = url.searchParams.get("de");
  const ate = url.searchParams.get("ate");
  if (!de || !ate || !DATA.test(de) || !DATA.test(ate))
    return fail("validation_failed", "Informe o período (de, ate).", 422, { requestId });

  const orgId = authz.org.orgId;
  const supabase = await createClient();

  async function buscar(filtro: (q: any) => any): Promise<LancamentoDash[] | null> {
    const todos: LancamentoDash[] = [];
    for (let p = 0; p < MAX_PAGINAS; p++) {
      const q = filtro(
        supabase
          .from("financial_entries")
          .select(COLUNAS)
          .eq("organization_id", orgId)
          .order("entry_date", { ascending: false })
          .order("id")
          .range(p * PAGINA, (p + 1) * PAGINA - 1),
      );
      const { data, error } = await q;
      if (error) return null;
      todos.push(...((data ?? []) as LancamentoDash[]));
      if ((data ?? []).length < PAGINA) break;
    }
    return todos;
  }

  const [periodo, pendentes] = await Promise.all([
    buscar((q) => q.gte("entry_date", de).lte("entry_date", ate)),
    buscar((q) => q.eq("status", "pending")),
  ]);
  if (!periodo || !pendentes) return fail("internal_error", "Falha ao ler os lançamentos.", 500, { requestId });

  return ok({ periodo, pendentes } satisfies DashboardFinanceiro, { requestId });
}
