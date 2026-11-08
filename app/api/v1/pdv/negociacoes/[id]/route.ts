/**
 * GET   /api/v1/pdv/negociacoes/:id — uma negociação.
 * PATCH /api/v1/pdv/negociacoes/:id — edita um rascunho (agent+), ou
 *       `{ "acao": "cancelar" }` para cancelá-lo. Negociação concluída não muda:
 *       o estoque já andou e o contrato já foi assinado.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { COLUNAS_DA_NEGOCIACAO, negociacaoPatchSchema } from "@/lib/pdv/regras";
import { vendedorEhDaOrganizacao } from "@/lib/pdv/vendedores";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const cancelarSchema = z.object({ acao: z.literal("cancelar") });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "negociacoes_de_veiculo" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("negociacoes_de_veiculo")
    .select(COLUNAS_DA_NEGOCIACAO)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return fail("not_found", t("Negociação não encontrada."), 404, { requestId });
  return ok(data, { requestId });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "negociacoes_de_veiculo" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await params;

  const corpo: unknown = await req.json().catch(() => null);
  const cancelar = cancelarSchema.safeParse(corpo).success;
  const parsed = cancelar ? null : negociacaoPatchSchema.safeParse(corpo);
  if (parsed && !parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  if (
    parsed?.data?.vendedor_user_id &&
    !(await vendedorEhDaOrganizacao(authz.org.orgId, parsed.data.vendedor_user_id))
  ) {
    return fail("validation_failed", t("Vendedor não encontrado na organização."), 422, {
      requestId,
    });
  }

  const supabase = await createClient();
  const { data: atual } = await supabase
    .from("negociacoes_de_veiculo")
    .select("id, tipo, status")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!atual) return fail("not_found", t("Negociação não encontrada."), 404, { requestId });
  if (atual.status !== "rascunho") {
    return fail("conflict", t("Negociação já fechada não pode ser alterada."), 409, { requestId });
  }

  const mudancas: Record<string, unknown> = cancelar
    ? { status: "cancelada", cancelada_em: new Date().toISOString() }
    : { ...parsed!.data };
  // Vazio não apaga o vendedor: ele só troca por outro membro.
  if (!mudancas.vendedor_user_id) delete mudancas.vendedor_user_id;
  if (!cancelar && atual.tipo === "compra") {
    delete mudancas.veiculo_id;
    delete mudancas.troca;
  }

  const { data, error } = await supabase
    .from("negociacoes_de_veiculo")
    .update(mudancas)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .eq("status", "rascunho")
    .select(COLUNAS_DA_NEGOCIACAO)
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao salvar a negociação.", 500, { requestId });
  if (!data)
    return fail("conflict", t("Negociação já fechada não pode ser alterada."), 409, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: cancelar ? "negociacao_veiculo.cancelled" : "negociacao_veiculo.updated",
    resourceType: "negociacoes_de_veiculo",
    resourceId: id,
    requestId,
  });
  return ok(data, { requestId });
}
