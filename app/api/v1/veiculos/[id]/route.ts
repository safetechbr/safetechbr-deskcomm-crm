/**
 * PATCH  /api/v1/veiculos/:id — edita campos (manager+). Mudar `status` para
 *        `vendido` carimba `vendido_em`; voltar a outro status limpa.
 * DELETE /api/v1/veiculos/:id — remove o veículo e seus arquivos (manager+).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { registrarCategoriaDaLoja } from "@/lib/veiculos/categorias-da-loja";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  arquivoPertenceAoVeiculo,
  BUCKET_DAS_FOTOS_DE_VEICULO,
  BUCKET_DO_VIDEO_DE_VEICULO,
  COLUNAS_DO_VEICULO,
  descreverVeiculo,
  veiculoPatchSchema,
} from "@/lib/veiculos/regras";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "veiculos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await params;

  const parsed = veiculoPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const mudanca: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status) mudanca.vendido_em = parsed.data.status === "vendido" ? new Date().toISOString() : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("veiculos")
    .update(mudanca)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .select(COLUNAS_DO_VEICULO)
    .maybeSingle();
  if (error) {
    if (error.code === "PT409") return fail("conflict", error.message, 409, { requestId });
    if (error.code === "23505") return fail("conflict", t("Já existe um veículo com esse código."), 409, { requestId });
    return fail("internal_error", "Erro ao salvar o veículo.", 500, { requestId });
  }
  if (!data) return fail("not_found", t("Veículo não encontrado."), 404, { requestId });

  if (parsed.data.categoria) await registrarCategoriaDaLoja(supabase, authz.org.orgId, parsed.data.categoria);
  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: parsed.data.status ? "veiculo.status_changed" : "veiculo.updated",
    resourceType: "veiculos",
    resourceId: id,
    metadata: { ...descreverVeiculo(data), ...(parsed.data.status ? { status: parsed.data.status } : {}) },
    requestId,
  });
  return ok(data, { requestId });
}

const excluirSchema = z.object({ motivo: z.string().trim().min(3).max(1000) });

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "veiculos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const { id } = await params;
  const corpo = excluirSchema.safeParse(await req.json().catch(() => null));
  if (!corpo.success) return fail("validation_failed", t("Informe o motivo da exclusão."), 422, { requestId });

  const supabase = await createClient();
  const { data } = await supabase
    .from("veiculos")
    .select("fotos, video, codigo, modelo, placa")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return fail("not_found", t("Veículo não encontrado."), 404, { requestId });

  const { error } = await supabase.from("veiculos").delete().eq("organization_id", orgId).eq("id", id);
  if (error) return fail("internal_error", "Erro ao remover o veículo.", 500, { requestId });

  // Arquivos só depois da linha; só os que são DESTE veículo (a coluna é gravável pelo PostgREST).
  const admin = createAdminClient();
  const fotos = ((data as { fotos: string[] | null }).fotos ?? []).filter((c) => arquivoPertenceAoVeiculo(c, orgId, id));
  if (fotos.length) await admin.storage.from(BUCKET_DAS_FOTOS_DE_VEICULO).remove(fotos);
  const video = (data as { video: string | null }).video;
  if (video && arquivoPertenceAoVeiculo(video, orgId, id, "video")) {
    await admin.storage.from(BUCKET_DO_VIDEO_DE_VEICULO).remove([video]);
  }

  await audit({
    organizationId: orgId,
    actorUserId: authz.user.id,
    action: "veiculo.deleted",
    resourceType: "veiculos",
    resourceId: id,
    metadata: { motivo: corpo.data.motivo, ...descreverVeiculo(data) },
    requestId,
  });
  return ok({ id }, { requestId });
}
