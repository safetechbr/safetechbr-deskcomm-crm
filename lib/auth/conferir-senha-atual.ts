import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { fetchDoServidor } from "@/lib/supabase/fetch-do-servidor";
import { urlDoSupabaseNoServidor } from "@/lib/supabase/url-do-servidor";

/**
 * Confere a senha atual num client SEM sessão e sem cookies, para não mexer na
 * sessão do navegador. Usado antes de trocar senha ou e-mail de dentro do sistema.
 */
export async function conferirSenhaAtual(email: string, senha: string): Promise<boolean> {
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
  const { error } = await verificador.auth.signInWithPassword({ email, password: senha });
  return !error;
}
