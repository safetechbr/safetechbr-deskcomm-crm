"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { audit, hashEmail } from "@/lib/audit";
import { conferirSenhaAtual } from "@/lib/auth/conferir-senha-atual";
import { sessionAal } from "@/lib/auth/server";
import { env } from "@/lib/env";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { createClient } from "@/lib/supabase/server";

export type TrocarEmailResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "validation_error"
        | "unauthenticated"
        | "same_email"
        | "mfa_required"
        | "wrong_current_password"
        | "email_in_use"
        | "rate_limited"
        | "update_failed";
    };

const emailSchema = z.string().trim().toLowerCase().email().max(254);

/**
 * Pede a troca do próprio e-mail, exigindo a senha atual. O GoTrue manda o link
 * de confirmação (para os dois endereços, com `double_confirm_changes`) e só
 * troca o e-mail depois do clique; até lá o login continua com o antigo.
 */
export async function trocarEmail(input: {
  email: string;
  current_password: string;
}): Promise<TrocarEmailResult> {
  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success || !input.current_password) return { ok: false, error: "validation_error" };
  const novoEmail = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { ok: false, error: "unauthenticated" };
  if (novoEmail === user.email.toLowerCase()) return { ok: false, error: "same_email" };

  const hdrs = await headers();
  const requestId = hdrs.get("x-request-id");
  const ip = ipDoCliente(hdrs);
  const userAgent = hdrs.get("user-agent") ?? null;

  // Conta com verificação em duas etapas: o GoTrue só troca o e-mail em AAL2.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && (await sessionAal()) !== "aal2") {
    return { ok: false, error: "mfa_required" };
  }

  if (!(await conferirSenhaAtual(user.email, input.current_password))) {
    return { ok: false, error: "wrong_current_password" };
  }

  const { error } = await supabase.auth.updateUser(
    { email: novoEmail },
    { emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/login/email-confirmado` },
  );
  if (error) {
    if (error.code === "email_exists" || /already been registered/i.test(error.message)) {
      return { ok: false, error: "email_in_use" };
    }
    if (error.status === 429) return { ok: false, error: "rate_limited" };
    return { ok: false, error: "update_failed" };
  }

  await audit({
    action: "auth.email_change_requested",
    actorUserId: user.id,
    metadata: { novo_email_hash: hashEmail(novoEmail) },
    requestId,
    ip,
    userAgent,
  });
  return { ok: true };
}
