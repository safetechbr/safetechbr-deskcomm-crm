import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { ok, fail } from "@/lib/api/wrappers";
export async function GET() {
  const requestId = randomUUID();
  const auth = await requireRole("viewer", { requestId, resource: "negociacoes_de_veiculo" });
  if (!auth.ok) return auth.response;
  const db = await createClient();
  const { data: parcelas, error } = await db
    .from("financial_entries")
    .select("id,negociacao_id,amount_cents,due_date,status,paid_at,parcela_numero")
    .eq("organization_id", auth.org.orgId)
    .eq("forma_pagamento", "crediario")
    .eq("origin", "negociacao")
    .order("due_date")
    .limit(10000);
  if (error)
    return fail("internal_error", "Não foi possível carregar os crediários.", 500, { requestId });
  const ids = [...new Set((parcelas ?? []).map((p) => p.negociacao_id))];
  if (!ids.length) return ok([], { requestId });
  const { data: todas, error: erroParcelas } = await db
    .from("financial_entries")
    .select("id,negociacao_id,amount_cents,due_date,status,paid_at,parcela_numero")
    .eq("organization_id", auth.org.orgId)
    .eq("origin", "negociacao")
    .in("negociacao_id", ids)
    .order("due_date")
    .limit(10000);
  if (erroParcelas)
    return fail("internal_error", "Não foi possível carregar as parcelas.", 500, { requestId });
  const { data: vendas, error: err } = await db
    .from("negociacoes_de_veiculo")
    .select("id,numero,cliente")
    .eq("organization_id", auth.org.orgId)
    .in("id", ids)
    .order("numero", { ascending: false });
  if (err)
    return fail("internal_error", "Não foi possível carregar as vendas.", 500, { requestId });
  return ok(
    (vendas ?? []).map((v) => ({
      ...v,
      parcelas: (todas ?? []).filter((p) => p.negociacao_id === v.id),
    })),
    { requestId },
  );
}
