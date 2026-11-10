import type { AuditAction } from "@/lib/audit/actions";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { SOCIAL_NETWORKS } from "@/lib/channels/social/catalog";
import { listSocialAccounts, SocialError } from "@/lib/channels/social/client";
import { presignarMidia } from "@/lib/channels/social/publicacoes";
import { readSocialIntegration } from "@/lib/channels/social/store";
import {
  cancelarStory,
  criarLoteDeStories,
  criarStories,
  editarStory,
  excluirJanela,
  janelaSchema,
  listarJanelas,
  listarStories,
  reenviarStory,
  salvarJanela,
  storyEdicaoSchema,
  storyLoteSchema,
  storyNovoSchema,
} from "@/lib/channels/social/stories/stories";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const MIME = /^(image\/(jpeg|png)|video\/(mp4|quicktime))$/;
const inputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("presign"),
      filename: z.string().min(1).max(200),
      content_type: z.string().regex(MIME),
      size: z.number().int().positive().max(300 * 1024 * 1024),
    })
    .strict(),
  z.object({ action: z.literal("create"), story: storyNovoSchema }).strict(),
  z.object({ action: z.literal("batch"), lote: storyLoteSchema }).strict(),
  z.object({ action: z.literal("edit"), edicao: storyEdicaoSchema }).strict(),
  z.object({ action: z.literal("cancel"), id: z.uuid(), escopo: z.enum(["single", "series"]).default("single") }).strict(),
  z.object({ action: z.literal("retry"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("janela_salvar"), janela: janelaSchema }).strict(),
  z.object({ action: z.literal("janela_excluir"), id: z.uuid() }).strict(),
]);

function failure(error: unknown, requestId: string) {
  return fail(
    "social_unavailable",
    error instanceof SocialError
      ? error.message
      : "Não foi possível concluir a operação nos Stories. Tente novamente.",
    error instanceof SocialError ? error.status : 502,
    { requestId, headers },
  );
}

export async function GET() {
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "social_stories" });
  if (!auth.ok) return auth.response;
  try {
    const db = createAdminClient();
    const config = await readSocialIntegration(db, auth.org.orgId);
    const contas = config
      ? (await listSocialAccounts(config.key, config.profileId))
          .filter((a) => a.isActive && a.platform === "instagram" && SOCIAL_NETWORKS.some((n) => n.id === a.platform))
          .map((a) => ({ id: a._id, platform: a.platform, name: a.username ?? a.displayName ?? a._id }))
      : [];
    return ok(
      {
        configured: !!config,
        accounts: contas,
        items: await listarStories(db, auth.org.orgId),
        janelas: await listarJanelas(db, auth.org.orgId),
      },
      { requestId, headers },
    );
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function POST(req: Request) {
  const requestId = randomUUID();
  const support = await requireSupportWrite();
  if (support) return support;
  const auth = await requireRole("manager", { requestId, resource: "social_stories" });
  if (!auth.ok) return auth.response;
  if (await mfaEmDivida())
    return fail("mfa_required", "Confirme a verificação em duas etapas.", 403, { requestId, headers });
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_error", "Confira os dados do Story.", 400, { requestId, headers });
  const limit = await checkRateLimit(`social-stories:${auth.org.orgId}`, 60, 60);
  if (!limit.allowed)
    return fail("rate_limited", "Aguarde um minuto antes de tentar novamente.", 429, {
      requestId,
      headers: { ...headers, "Retry-After": "60" },
    });
  const body = parsed.data;
  const org = auth.org.orgId;
  const db = createAdminClient();
  const registrar = (action: AuditAction, recursoId: string, metadata: Record<string, unknown>) =>
    void audit({
      action,
      organizationId: org,
      actorUserId: auth.user.id,
      resourceType: "social_publicacoes",
      resourceId: recursoId,
      requestId,
      metadata,
    });
  try {
    switch (body.action) {
      case "presign":
        return ok(
          await presignarMidia(db, org, { filename: body.filename, contentType: body.content_type, size: body.size }),
          { requestId, headers },
        );
      case "create": {
        const r = await criarStories(db, org, auth.user.id, body.story);
        registrar("channel.social_story_agendado", r.ids[0]!, { quantidade: r.ids.length, serie: !!r.serie_id });
        return ok(r, { requestId, headers });
      }
      case "batch": {
        const r = await criarLoteDeStories(db, org, auth.user.id, body.lote);
        registrar("channel.social_story_lote_agendado", r.ids[0]!, { quantidade: r.ids.length });
        return ok(r, { requestId, headers });
      }
      case "edit": {
        const r = await editarStory(db, org, body.edicao);
        registrar("channel.social_story_editado", body.edicao.id, { escopo: body.edicao.escopo, quantidade: r.ids.length });
        return ok(r, { requestId, headers });
      }
      case "cancel": {
        const r = await cancelarStory(db, org, body.id, body.escopo);
        registrar("channel.social_story_cancelado", body.id, { escopo: body.escopo, quantidade: r.ids.length });
        return ok(r, { requestId, headers });
      }
      case "retry": {
        const r = await reenviarStory(db, org, body.id);
        registrar("channel.social_story_reenviado", body.id, {});
        return ok(r, { requestId, headers });
      }
      case "janela_salvar": {
        const r = await salvarJanela(db, org, body.janela);
        registrar("channel.social_story_janela_salva", r.id, { nome: body.janela.nome });
        return ok(r, { requestId, headers });
      }
      case "janela_excluir": {
        const r = await excluirJanela(db, org, body.id);
        registrar("channel.social_story_janela_excluida", r.id, {});
        return ok(r, { requestId, headers });
      }
    }
  } catch (error) {
    return failure(error, requestId);
  }
}
