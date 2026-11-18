/**
 * GET   /api/v1/pdv/negociacoes/:id — uma negociação.
 * PATCH /api/v1/pdv/negociacoes/:id — edita um rascunho (agent+), ou
 *       `{ "acao": "cancelar" }` para cancelá-lo. Negociação concluída não muda:
 *       o estoque já andou e o contrato já foi assinado.
 * DELETE /api/v1/pdv/negociacoes/:id — exclui com `{ "motivo": "..." }` (manager+).
 *       A venda concluída é desfeita: carro volta ao estoque, troca sai, financeiro estorna.
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
import { sincronizarContatoComNegociacao } from "@/lib/pdv/sincronizar-contato";
import { vendedorEhDaOrganizacao } from "@/lib/pdv/vendedores";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  arquivoPertenceAoVeiculo,
  BUCKET_DAS_FOTOS_DE_VEICULO,
  BUCKET_DO_VIDEO_DE_VEICULO,
} from "@/lib/veiculos/regras";

export const dynamic = "force-dynamic";

const cancelarSchema = z.object({ acao: z.literal("cancelar") });
const excluirSchema = z.object({ motivo: z.string().trim().min(3).max(1000) });

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

  const contatoId = (data as { contact_id?: string | null }).contact_id;
  if (!cancelar && contatoId && parsed?.data?.cliente)
    await sincronizarContatoComNegociacao(
      supabase,
      authz.org.orgId,
      contatoId,
      parsed.data.cliente,
    );

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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "negociacoes_de_veiculo" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const { id } = await params;

  const parsed = excluirSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Informe o motivo da exclusão."), 422, { requestId });
  }

  const supabase = await createClient();
  const { data: dono } = await supabase
    .from("negociacoes_de_veiculo")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!dono) return fail("not_found", t("Negociação não encontrada."), 404, { requestId });

  const { data, error } = await supabase.rpc("fn_excluir_negociacao_de_veiculo", {
    p_id: id,
    p_motivo: parsed.data.motivo,
  });
  if (error) {
    if (error.message.includes("veiculo_ja_revendido")) {
      return fail(
        "conflict",
        t("O veículo desta negociação já foi revendido. Exclua aquela venda antes."),
        409,
        { requestId },
      );
    }
    if (error.message.includes("negociacao_ja_excluida")) {
      return fail("conflict", t("Negociação já excluída."), 409, { requestId });
    }
    if (error.code === "42501") return fail("forbidden", t("Sem permissão."), 403, { requestId });
    if (error.code === "P0002") return fail("not_found", t("Negociação não encontrada."), 404, { requestId });
    return fail("internal_error", "Erro ao excluir a negociação.", 500, { requestId });
  }

  const resultado = data as {
    numero: number;
    tipo: string;
    status_anterior: string;
    veiculos_removidos: { id: string; fotos: string[] | null; video: string | null }[];
  };

  // Arquivos dos carros que saíram do estoque, só depois da linha (molde do DELETE de veículo).
  const admin = createAdminClient();
  for (const v of resultado.veiculos_removidos ?? []) {
    const fotos = (v.fotos ?? []).filter((c) => arquivoPertenceAoVeiculo(c, orgId, v.id));
    if (fotos.length) await admin.storage.from(BUCKET_DAS_FOTOS_DE_VEICULO).remove(fotos);
    if (v.video && arquivoPertenceAoVeiculo(v.video, orgId, v.id, "video")) {
      await admin.storage.from(BUCKET_DO_VIDEO_DE_VEICULO).remove([v.video]);
    }
  }

  await audit({
    organizationId: orgId,
    actorUserId: authz.user.id,
    action: "negociacao_veiculo.deleted",
    resourceType: "negociacoes_de_veiculo",
    resourceId: id,
    metadata: {
      motivo: parsed.data.motivo,
      numero: resultado.numero,
      tipo: resultado.tipo,
      status_anterior: resultado.status_anterior,
    },
    requestId,
  });
  return ok({ id }, { requestId });
}
