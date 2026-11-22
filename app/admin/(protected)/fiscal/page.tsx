import { notFound } from "next/navigation";

import { loadAuthUser } from "@/lib/auth/server";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

import { FormularioDoFocus } from "./_form";

export const metadata = { title: "Focus NFe da instalação" };
export const dynamic = "force-dynamic";

/**
 * Onde o dono da instalação cola o token de revenda da Focus NFe. É da
 * INSTALAÇÃO (cadastra as empresas de todas as lojas), por isso /admin e não
 * /app/settings. Irmã de /admin/meta.
 *
 * ⚠️ Nenhum segredo vai ao cliente: só booleanos e data.
 */
export default async function Page() {
  const usuario = await loadAuthUser();
  if (!usuario?.is_platform_admin) notFound();

  const { data, error } = await createAdminClient()
    .from("platform_fiscal_focus")
    .select("token_revenda_encrypted, updated_at")
    .eq("id", 1)
    .maybeSingle();
  const linha = data as { token_revenda_encrypted: string | null; updated_at: string | null } | null;

  return (
    <FormularioDoFocus
      temTokenSalvo={Boolean(linha?.token_revenda_encrypted)}
      atualizadoEm={
        linha?.updated_at
          ? new Date(linha.updated_at).toLocaleString(tagDeIdioma(usuario.idioma), {
              timeZone: "America/Sao_Paulo",
              dateStyle: "short",
              timeStyle: "short",
            })
          : null
      }
      temNoAmbiente={Boolean(env.FOCUS_TOKEN_REVENDA.trim())}
      leituraFalhou={Boolean(error)}
    />
  );
}
