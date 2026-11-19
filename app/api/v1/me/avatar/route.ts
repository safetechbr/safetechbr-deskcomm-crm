/**
 * GET    /api/v1/me/avatar — a foto do perfil de QUEM PEDE (bytes, cache privado).
 * POST   /api/v1/me/avatar — sobe a foto (multipart `file`, PNG/JPEG até 512 KB).
 * DELETE /api/v1/me/avatar — remove a foto (e a URL externa antiga, se houver).
 *
 * Bucket `user-avatars` é PRIVADO e sem policy (migration 9047): só o service
 * role daqui escreve e lê, depois de conferir a sessão. O caminho mora em
 * `user_metadata.avatar_path` e é sempre `<user_id>/<uuid>.<png|jpg>`, gerado
 * aqui; antes de ler ou apagar, o prefixo é reconferido (`podeApagar`), porque o
 * metadata é escrevível pela própria pessoa via `auth.updateUser`.
 */
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { extensaoDe, farejarTipo, podeApagar } from "@/lib/branding/logo-arquivo";
import { traduzir } from "@/lib/i18n/dicionario";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { logger } from "@/lib/logger";
import { urlDaFotoDoPerfil } from "@/lib/auth/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BUCKET_DE_AVATARES = "user-avatars";
const TAMANHO_MAXIMO_DO_AVATAR = 512 * 1024;
const TETO_POR_USUARIO = 10;
const JANELA_SEGUNDOS = 300;

async function usuarioDaSessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const caminho = typeof meta.avatar_path === "string" ? meta.avatar_path : null;
  const t = (texto: string) => traduzir(texto, normalizarIdioma(meta.locale as string | null));
  // Só um caminho DENTRO da pasta da pessoa conta; o resto é tratado como ausente.
  return { supabase, id: user.id, prefixo: `${user.id}/`, caminho: podeApagar(caminho, `${user.id}/`) ? caminho : null, t };
}

async function apagar(caminho: string | null, requestId: string) {
  if (!caminho) return;
  const { error } = await createAdminClient().storage.from(BUCKET_DE_AVATARES).remove([caminho]);
  // Falha aqui deixa um órfão no bucket; o perfil já está certo.
  if (error) logger.warn("[me/avatar] remoção falhou", { detalhe: error.message, requestId });
}

export async function GET(): Promise<Response> {
  const quem = await usuarioDaSessao();
  if (!quem) return fail("unauthenticated", "Faça login.", 401);
  if (!quem.caminho) return fail("not_found", quem.t("Sem foto de perfil."), 404);
  const { data, error } = await createAdminClient().storage.from(BUCKET_DE_AVATARES).download(quem.caminho);
  if (error || !data) return fail("not_found", quem.t("Sem foto de perfil."), 404);
  const bytes = new Uint8Array(await data.arrayBuffer());
  const tipo = farejarTipo(bytes);
  if (!tipo) return fail("not_found", quem.t("Sem foto de perfil."), 404);
  return new Response(bytes, {
    headers: {
      "Content-Type": tipo,
      // A URL carrega `?v=<arquivo>`; troca de foto = URL nova, então o cache pode ser longo.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function limite(id: string, requestId: string, t: (s: string) => string) {
  const r = await checkRateLimit(`me-avatar:${id}`, TETO_POR_USUARIO, JANELA_SEGUNDOS);
  if (r.allowed) return null;
  return fail("rate_limited", t("Muitas trocas de foto seguidas. Tente em alguns minutos."), 429, {
    requestId,
    headers: { "Retry-After": String(JANELA_SEGUNDOS) },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const quem = await usuarioDaSessao();
  if (!quem) return fail("unauthenticated", "Faça login.", 401, { requestId });
  const t = quem.t;
  const barrado = await limite(quem.id, requestId, t);
  if (barrado) return barrado;

  // Content-Length antes de bufferizar; `file.size` abaixo é o check que vale.
  if (Number(req.headers.get("content-length") ?? 0) > TAMANHO_MAXIMO_DO_AVATAR + 65_536) {
    return fail("payload_too_large", t("A foto precisa ter até 512 KB."), 413, { requestId });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return fail("validation_failed", t("Campo 'file' (multipart) obrigatório."), 422, { requestId });
  }
  if (file.size > TAMANHO_MAXIMO_DO_AVATAR) {
    return fail("payload_too_large", t("A foto precisa ter até 512 KB."), 413, { requestId });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const tipo = farejarTipo(bytes);
  if (!tipo) {
    return fail("unsupported_media_type", t("A foto precisa ser JPG ou PNG."), 415, {
      requestId,
      details: { content_type_declarado: file.type || null },
    });
  }

  const caminho = `${quem.prefixo}${randomUUID()}.${extensaoDe(tipo)}`;
  const { error: erroUp } = await createAdminClient()
    .storage.from(BUCKET_DE_AVATARES)
    .upload(caminho, bytes, { contentType: tipo, upsert: false });
  if (erroUp) {
    logger.error("[me/avatar] upload falhou", { detalhe: erroUp.message, requestId });
    return fail("internal_error", t("Erro ao subir a foto."), 500, { requestId });
  }

  // Ordem sobe → grava → apaga: se gravar falhar, o arquivo novo é que sai.
  const { error: erroMeta } = await quem.supabase.auth.updateUser({
    data: { avatar_path: caminho, avatar_url: null },
  });
  if (erroMeta) {
    await apagar(caminho, requestId);
    logger.error("[me/avatar] gravar no perfil falhou", { detalhe: erroMeta.message, requestId });
    return fail("internal_error", t("Erro ao subir a foto."), 500, { requestId });
  }
  await apagar(quem.caminho, requestId);
  await audit({
    action: "profile.updated",
    actorUserId: quem.id,
    resourceType: "user",
    resourceId: quem.id,
    requestId,
    metadata: { avatar: "atualizado" },
  });
  return ok({ avatar_url: urlDaFotoDoPerfil(quem.id, { avatar_path: caminho }) }, { requestId });
}

export async function DELETE(): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const quem = await usuarioDaSessao();
  if (!quem) return fail("unauthenticated", "Faça login.", 401, { requestId });
  const barrado = await limite(quem.id, requestId, quem.t);
  if (barrado) return barrado;

  const { error } = await quem.supabase.auth.updateUser({ data: { avatar_path: null, avatar_url: null } });
  if (error) {
    logger.error("[me/avatar] limpar perfil falhou", { detalhe: error.message, requestId });
    return fail("internal_error", quem.t("Erro ao remover a foto."), 500, { requestId });
  }
  await apagar(quem.caminho, requestId);
  await audit({
    action: "profile.updated",
    actorUserId: quem.id,
    resourceType: "user",
    resourceId: quem.id,
    requestId,
    metadata: { avatar: "removido" },
  });
  return ok({ avatar_url: null }, { requestId });
}
