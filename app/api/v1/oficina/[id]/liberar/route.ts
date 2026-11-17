/**
 * POST /api/v1/oficina/:id/liberar — `{ preco_cents? }` tira o veículo da
 * oficina: vira `disponivel` e passa a aparecer no Estoque (manager+).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { liberarSchema, STATUS_EM_OFICINA } from "@/lib/oficina/regras";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "oficina" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await params;

  const parsed = liberarSchema.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, { requestId });
  }

  const supabase = await createClient();
  const { data: v } = await supabase
    .from("veiculos")
    .select("id, status, preco_cents")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!v) return fail("not_found", t("Veículo não encontrado."), 404, { requestId });
  if (v.status !== STATUS_EM_OFICINA) {
    return fail("conflict", t("Esse veículo já saiu da oficina."), 409, { requestId });
  }
  const preco = parsed.data.preco_cents ?? v.preco_cents;
  if (!preco || preco <= 0) {
    return fail("validation_failed", t("Defina o preço de venda para liberar o veículo."), 422, {
      requestId,
    });
  }

  const { data, error } = await supabase
    .from("veiculos")
    .update({ status: "disponivel", preco_cents: preco })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .eq("status", STATUS_EM_OFICINA)
    .select("id, status")
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao liberar o veículo.", 500, { requestId });
  if (!data) return fail("conflict", t("Esse veículo já saiu da oficina."), 409, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "veiculo.liberado",
    resourceType: "veiculos",
    resourceId: id,
    requestId,
  });
  return ok(data, { requestId });
}
