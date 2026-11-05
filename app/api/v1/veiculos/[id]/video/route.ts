/**
 * POST   /api/v1/veiculos/:id/video — sobe o vídeo curto opcional (multipart `file`, MP4 até 16 MB).
 * DELETE /api/v1/veiculos/:id/video — remove.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { arquivoPertenceAoVeiculo, BUCKET_DO_VIDEO_DE_VEICULO, TAMANHO_MAXIMO_DO_VIDEO } from "@/lib/veiculos/regras";

export const dynamic = "force-dynamic";

/** MP4/ISO-BMFF: "ftyp" nos bytes 4..8. */
function pareceMp4(b: Uint8Array): boolean {
  return b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
}

async function videoAtual(orgId: string, id: string): Promise<{ existe: boolean; video: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.from("veiculos").select("video").eq("organization_id", orgId).eq("id", id).maybeSingle();
  return { existe: data !== null, video: (data as { video: string | null } | null)?.video ?? null };
}

async function remover(orgId: string, id: string, video: string | null): Promise<void> {
  if (video && arquivoPertenceAoVeiculo(video, orgId, id, "video")) {
    await createAdminClient().storage.from(BUCKET_DO_VIDEO_DE_VEICULO).remove([video]);
  }
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

  const atual = await videoAtual(orgId, id);
  if (!atual.existe) return fail("not_found", t("Veículo não encontrado."), 404, { requestId });

  if (Number(req.headers.get("content-length") ?? 0) > TAMANHO_MAXIMO_DO_VIDEO + 1_048_576) {
    return fail("payload_too_large", t("O vídeo precisa ter até 16 MB."), 413, { requestId });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("validation_failed", t("Campo 'file' (multipart) obrigatório."), 422, { requestId });
  if (file.size > TAMANHO_MAXIMO_DO_VIDEO) return fail("payload_too_large", t("O vídeo precisa ter até 16 MB."), 413, { requestId });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!pareceMp4(bytes)) return fail("unsupported_media_type", t("O vídeo precisa ser MP4."), 415, { requestId });

  const caminho = `${orgId}/${id}/${randomUUID()}.mp4`;
  const { error: erroUp } = await createAdminClient()
    .storage.from(BUCKET_DO_VIDEO_DE_VEICULO)
    .upload(caminho, bytes, { contentType: "video/mp4", upsert: false });
  if (erroUp) return fail("internal_error", "Erro ao subir o vídeo.", 500, { requestId });

  const supabase = await createClient();
  const { error } = await supabase.from("veiculos").update({ video: caminho }).eq("organization_id", orgId).eq("id", id);
  if (error) {
    await remover(orgId, id, caminho);
    return fail("internal_error", "Erro ao salvar o vídeo.", 500, { requestId });
  }
  await remover(orgId, id, atual.video);
  await audit({ organizationId: orgId, actorUserId: authz.user.id, action: "veiculo.video_set", resourceType: "veiculos", resourceId: id, requestId });
  return ok({ video: caminho }, { requestId });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "veiculos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const { id } = await params;

  const atual = await videoAtual(orgId, id);
  if (!atual.existe) return fail("not_found", t("Veículo não encontrado."), 404, { requestId });
  const supabase = await createClient();
  const { error } = await supabase.from("veiculos").update({ video: null }).eq("organization_id", orgId).eq("id", id);
  if (error) return fail("internal_error", "Erro ao remover o vídeo.", 500, { requestId });
  await remover(orgId, id, atual.video);
  await audit({ organizationId: orgId, actorUserId: authz.user.id, action: "veiculo.video_removed", resourceType: "veiculos", resourceId: id, requestId });
  return ok({ video: null }, { requestId });
}
