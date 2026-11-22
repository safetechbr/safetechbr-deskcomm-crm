"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { escritaDeAdminOuRecusa } from "@/lib/auth/escritaDeAdminOuRecusa";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

export type UpdateFocusTokenResult = { ok: true } | { ok: false; error: string; details?: unknown };

const schema = z.object({ token: z.string().trim().min(10).max(200) });

/**
 * Grava o token de revenda da Focus NFe DESTA INSTALAÇÃO. Gate: platform admin
 * (mesmo de `updateMetaApp`). Cifra obrigatória: sem chave mestra, recusa em vez
 * de gravar em claro.
 */
export async function updateFocusToken(input: { token: string }): Promise<UpdateFocusTokenResult> {
  const escrita = await escritaDeAdminOuRecusa();
  if (!escrita.ok) return escrita;
  const { user } = escrita.ctx;

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input", details: parsed.error.flatten() };

  const admin = createAdminClient();
  const cifrado = await encryptWebhookSecret(admin, parsed.data.token);
  if (!cifrado) {
    return { ok: false, error: "cifra indisponível nesta instalação (GUC app.nuvemshop_oauth_key ausente) — o token não foi gravado" };
  }

  // upsert: um update numa instalação sem a linha casaria zero linhas e diria "salvo".
  const { error } = await admin
    .from("platform_fiscal_focus")
    .upsert({ id: 1, token_revenda_encrypted: cifrado, updated_by: user.id }, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };

  const cab = await headers();
  await audit({
    action: "platform_fiscal_focus.updated",
    actorUserId: user.id,
    resourceType: "platform_fiscal_focus",
    resourceId: null, // api_audit_log.resource_id é uuid; "1" estouraria 22P02
    requestId: cab.get("x-request-id") ?? undefined,
    ip: ipDoCliente(cab) ?? undefined,
    userAgent: cab.get("user-agent") ?? undefined,
    actingAsPlatformAdmin: true,
    metadata: { campos: ["token_revenda_encrypted"] }, // o QUE mudou, nunca o valor
  });
  return { ok: true };
}
