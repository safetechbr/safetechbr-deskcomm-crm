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
import { lerSeguranca, segurancaSchema } from "@/lib/channels/social/seguranca";
import { readSocialIntegration } from "@/lib/channels/social/store";
import {
  cancelarPublicacao,
  criarPublicacao,
  listarPublicacoes,
  presignarMidia,
  publicacaoSchema,
} from "@/lib/channels/social/publicacoes";

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
  z.object({ action: z.literal("create"), publicacao: publicacaoSchema }).strict(),
  z.object({ action: z.literal("cancel"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("seguranca"), seguranca: segurancaSchema }).strict(),
]);
function failure(error: unknown, requestId: string) {
  return fail(
    "social_unavailable",
    error instanceof SocialError
      ? error.message
      : "Não foi possível concluir a operação nas redes sociais. Tente novamente.",
    error instanceof SocialError ? error.status : 502,
    { requestId, headers },
  );
}
export async function GET() {
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "social_publicacoes" });
  if (!auth.ok) return auth.response;
  try {
    const db = createAdminClient();
    const config = await readSocialIntegration(db, auth.org.orgId);
    const contas = config
      ? (await listSocialAccounts(config.key, config.profileId))
          .filter((a) => a.isActive && SOCIAL_NETWORKS.some((n) => n.id === a.platform))
          .map((a) => ({
            id: a._id,
            platform: a.platform,
            name: a.username ?? a.displayName ?? a._id,
          }))
      : [];
    const { data: seg } = await db
      .from("social_seguranca")
      .select("limite_diario, intervalo_min_s, intervalo_max_s, lote, pausa_lote_s")
      .eq("organization_id", auth.org.orgId)
      .maybeSingle();
    return ok(
      {
        configured: !!config,
        accounts: contas,
        items: await listarPublicacoes(db, auth.org.orgId),
        seguranca: lerSeguranca(seg),
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
  const auth = await requireRole("manager", { requestId, resource: "social_publicacoes" });
  if (!auth.ok) return auth.response;
  if (await mfaEmDivida())
    return fail("mfa_required", "Confirme a verificação em duas etapas.", 403, {
      requestId,
      headers,
    });
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_error", "Confira os dados da publicação.", 400, { requestId, headers });
  const limit = await checkRateLimit(`social-publicar:${auth.org.orgId}`, 60, 60);
  if (!limit.allowed)
    return fail("rate_limited", "Aguarde um minuto antes de tentar novamente.", 429, {
      requestId,
      headers: { ...headers, "Retry-After": "60" },
    });
  const body = parsed.data;
  const db = createAdminClient();
  try {
    if (body.action === "presign") {
      return ok(
        await presignarMidia(db, auth.org.orgId, {
          filename: body.filename,
          contentType: body.content_type,
          size: body.size,
        }),
        { requestId, headers },
      );
    }
    if (body.action === "create") {
      const r = await criarPublicacao(db, auth.org.orgId, auth.user.id, body.publicacao);
      void audit({
        action: "channel.social_publicacao_agendada",
        organizationId: auth.org.orgId,
        actorUserId: auth.user.id,
        resourceType: "social_publicacoes",
        resourceId: r.id,
        requestId,
        metadata: { tipo: body.publicacao.tipo, contas: body.publicacao.account_ids.length },
      });
      return ok(r, { requestId, headers });
    }
    if (body.action === "seguranca") {
      const { error } = await db
        .from("social_seguranca")
        .upsert(
          { organization_id: auth.org.orgId, ...body.seguranca, updated_at: new Date().toISOString() },
          { onConflict: "organization_id" },
        );
      if (error) throw new SocialError("Não foi possível salvar as regras de segurança.", 500);
      void audit({
        action: "channel.social_seguranca_atualizada",
        organizationId: auth.org.orgId,
        actorUserId: auth.user.id,
        resourceType: "social_seguranca",
        resourceId: auth.org.orgId,
        requestId,
        metadata: { ...body.seguranca },
      });
      return ok(body.seguranca, { requestId, headers });
    }
    const r = await cancelarPublicacao(db, auth.org.orgId, body.id);
    void audit({
      action: "channel.social_publicacao_cancelada",
      organizationId: auth.org.orgId,
      actorUserId: auth.user.id,
      resourceType: "social_publicacoes",
      resourceId: r.id,
      requestId,
      metadata: {},
    });
    return ok(r, { requestId, headers });
  } catch (error) {
    return failure(error, requestId);
  }
}
