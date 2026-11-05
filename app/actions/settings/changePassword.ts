"use server";

import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { resetPasswordSchema } from "@/lib/auth/schemas";
import { sessionAal } from "@/lib/auth/server";
import { env } from "@/lib/env";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { createClient } from "@/lib/supabase/server";
import { fetchDoServidor } from "@/lib/supabase/fetch-do-servidor";
import { urlDoSupabaseNoServidor } from "@/lib/supabase/url-do-servidor";

export type ChangePasswordResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "validation_error"
        | "unauthenticated"
        | "wrong_current_password"
        | "same_password"
        | "mfa_required"
        | "update_failed";
      details?: Record<string, unknown>;
    };

/**
 * Troca a senha de dentro do sistema (usuário já logado), exigindo a senha
 * atual. A senha atual é conferida num client SEM sessão e sem cookies, para
 * não mexer na sessão do navegador; a nova segue as mesmas regras do reset.
 * A sessão atual continua aberta ao terminar.
 */
export async function changePassword(input: {
  current_password: string;
  password: string;
  password_confirm: string;
}): Promise<ChangePasswordResult> {
  const parsed = resetPasswordSchema.safeParse({
    password: input.password,
    password_confirm: input.password_confirm,
  });
  if (!parsed.success || !input.current_password) {
    return {
      ok: false,
      error: "validation_error",
      details: parsed.success ? undefined : parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { ok: false, error: "unauthenticated" };

  const hdrs = await headers();
  const requestId = hdrs.get("x-request-id");
  const ip = ipDoCliente(hdrs);
  const userAgent = hdrs.get("user-agent") ?? null;

  if (input.current_password === parsed.data.password) {
    return { ok: false, error: "same_password" };
  }

  // Conta com verificação em duas etapas: o GoTrue só troca a senha em AAL2.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && (await sessionAal()) !== "aal2") {
    return { ok: false, error: "mfa_required" };
  }

  // Confere a senha atual sem tocar na sessão do navegador.
  const verificador = createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: {
        fetch: fetchDoServidor(
          urlDoSupabaseNoServidor(env.SUPABASE_SERVER_URL, env.NEXT_PUBLIC_SUPABASE_URL),
          env.NEXT_PUBLIC_SUPABASE_URL,
        ),
      },
    },
  );
  const { error: senhaErrada } = await verificador.auth.signInWithPassword({
    email: user.email,
    password: input.current_password,
  });
  if (senhaErrada) {
    await audit({
      action: "auth.password_reset_failed",
      actorUserId: user.id,
      metadata: { reason: "senha_atual_incorreta", via: "settings" },
      requestId,
      ip,
      userAgent,
    });
    return { ok: false, error: "wrong_current_password" };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (/different from the old password/i.test(error.message)) {
      return { ok: false, error: "same_password" };
    }
    await audit({
      action: "auth.password_reset_failed",
      actorUserId: user.id,
      metadata: { reason: error.message, via: "settings" },
      requestId,
      ip,
      userAgent,
    });
    return { ok: false, error: "update_failed" };
  }

  await audit({
    action: "auth.password_reset_completed",
    actorUserId: user.id,
    metadata: { via: "settings" },
    requestId,
    ip,
    userAgent,
  });
  return { ok: true };
}
