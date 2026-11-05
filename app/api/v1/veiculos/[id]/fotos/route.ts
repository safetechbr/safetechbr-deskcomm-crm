/**
 * POST /api/v1/veiculos/:id/fotos — sobe UMA foto (multipart `file`) e a põe no fim.
 * PUT  /api/v1/veiculos/:id/fotos — `{ fotos: string[] }`: reordena e remove.
 * Mesmo desenho de products/[id]/fotos (caminho gerado aqui, PUT nunca acrescenta).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { conferirNovaOrdem, extensaoDe, farejarTipo } from "@/lib/catalogo/fotos";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  arquivoPertenceAoVeiculo,
  BUCKET_DAS_FOTOS_DE_VEICULO,
  MAXIMO_DE_FOTOS_DO_VEICULO,
  TAMANHO_MAXIMO_DA_FOTO_DO_VEICULO,
} from "@/lib/veiculos/regras";

export const dynamic = "force-dynamic";

const ordemSchema = z.object({ fotos: z.array(z.string().min(1).max(300)).max(MAXIMO_DE_FOTOS_DO_VEICULO) });

async function fotosAtuais(orgId: string, id: string): Promise<string[] | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("veiculos").select("fotos").eq("organization_id", orgId).eq("id", id).maybeSingle();
  return data ? ((data as { fotos: string[] | null }).fotos ?? []) : null;
}

async function gravarFotos(orgId: string, id: string, fotos: string[]): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("veiculos")
    .update({ fotos })
    .eq("organization_id", orgId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  return !error && data !== null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "veiculos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const { id } = await params;

  const atuais = await fotosAtuais(orgId, id);
  if (atuais === null) return fail("not_found", t("Veículo não encontrado."), 404, { requestId });
  if (atuais.length >= MAXIMO_DE_FOTOS_DO_VEICULO) {
    return fail("validation_failed", t("Cada veículo tem no máximo 15 fotos."), 422, { requestId });
  }

  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > TAMANHO_MAXIMO_DA_FOTO_DO_VEICULO + 1_048_576) {
    return fail("payload_too_large", t("A foto precisa ter até 10 MB."), 413, { requestId });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return fail("validation_failed", t("Campo 'file' (multipart) obrigatório."), 422, { requestId });
  }
  if (file.size > TAMANHO_MAXIMO_DA_FOTO_DO_VEICULO) {
    return fail("payload_too_large", t("A foto precisa ter até 10 MB."), 413, { requestId });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const tipo = farejarTipo(bytes);
  if (!tipo) {
    return fail("unsupported_media_type", t("A foto precisa ser JPG ou PNG."), 415, { requestId });
  }

  const caminho = `${orgId}/${id}/${randomUUID()}.${extensaoDe(tipo)}`;
  const { error: erroUp } = await createAdminClient()
    .storage.from(BUCKET_DAS_FOTOS_DE_VEICULO)
    .upload(caminho, bytes, { contentType: tipo, upsert: false });
  if (erroUp) {
    logger.error("[veiculos/fotos] upload falhou", { detalhe: erroUp.message, requestId });
    return fail("internal_error", "Erro ao subir a foto.", 500, { requestId });
  }

  // Releitura logo antes de gravar: o envio em lote sobe várias fotos em sequência.
  const recentes = (await fotosAtuais(orgId, id)) ?? atuais;
  const fotos = [...recentes, caminho];
  if (!(await gravarFotos(orgId, id, fotos))) {
    await createAdminClient().storage.from(BUCKET_DAS_FOTOS_DE_VEICULO).remove([caminho]);
    return fail("internal_error", "Erro ao salvar a foto.", 500, { requestId });
  }
  await audit({
    organizationId: orgId,
    actorUserId: authz.user.id,
    action: "veiculo.photo_added",
    resourceType: "veiculos",
    resourceId: id,
    requestId,
  });
  return ok({ fotos }, { requestId });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "veiculos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const { id } = await params;

  const parsed = ordemSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Dados inválidos."), 422, { requestId });

  const atuais = await fotosAtuais(orgId, id);
  if (atuais === null) return fail("not_found", t("Veículo não encontrado."), 404, { requestId });
  const conferida = conferirNovaOrdem(atuais, parsed.data.fotos);
  if (!conferida.ok) return fail("conflict", t("As fotos mudaram. Recarregue a página."), 409, { requestId });
  if (!(await gravarFotos(orgId, id, parsed.data.fotos))) {
    return fail("internal_error", "Erro ao salvar as fotos.", 500, { requestId });
  }
  const apagar = conferida.removidas.filter((c) => arquivoPertenceAoVeiculo(c, orgId, id));
  if (apagar.length) await createAdminClient().storage.from(BUCKET_DAS_FOTOS_DE_VEICULO).remove(apagar);

  await audit({
    organizationId: orgId,
    actorUserId: authz.user.id,
    action: "veiculo.photos_updated",
    resourceType: "veiculos",
    resourceId: id,
    requestId,
  });
  return ok({ fotos: parsed.data.fotos }, { requestId });
}
