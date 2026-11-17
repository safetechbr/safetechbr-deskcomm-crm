/**
 * PUT /api/v1/oficina/:id/os — `{ itens: [{descricao, valor_cents}] }` substitui
 * os reparos (ordem de serviço) do veículo (manager+). Dado interno.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { custoTotalDoVeiculo, osSchema, STATUS_EM_OFICINA } from "@/lib/oficina/regras";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PUT(
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

  const parsed = osSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  const { data: v } = await supabase
    .from("veiculos")
    .select("id, status, custo_cents")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!v) return fail("not_found", t("Veículo não encontrado."), 404, { requestId });
  if (v.status !== STATUS_EM_OFICINA) {
    return fail("conflict", t("Esse veículo já saiu da oficina."), 409, { requestId });
  }

  const { error } = await supabase.rpc("fn_salvar_os_do_veiculo", {
    p_veiculo: id,
    p_itens: parsed.data.itens,
  });
  if (error)
    return fail("internal_error", "Erro ao salvar a ordem de serviço.", 500, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "veiculo.os_saved",
    resourceType: "veiculos",
    resourceId: id,
    requestId,
    metadata: { itens: parsed.data.itens.length },
  });
  return ok(
    {
      itens: parsed.data.itens,
      custo_total_cents: custoTotalDoVeiculo(v.custo_cents, parsed.data.itens),
    },
    { requestId },
  );
}
