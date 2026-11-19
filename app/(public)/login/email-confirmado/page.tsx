import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";
import { traduzir } from "@/lib/i18n/dicionario";
import { tituloDaTelaPublica } from "@/lib/i18n/titulo-da-tela-publica";

// A aba no idioma do visitante, como o corpo (`lib/i18n/titulo-da-tela-publica.ts`).
export const generateMetadata = () => tituloDaTelaPublica((t) => t("E-mail confirmado"));

/**
 * Volta do link de troca de e-mail. O GoTrue já aplicou a confirmação no
 * `/auth/v1/verify` antes de redirecionar; o `?code=` que vem junto é ignorado
 * de propósito (o verificador de PKCE não viaja em navegação cross-site).
 */
export default async function EmailConfirmadoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const idioma = await idiomaDoVisitante(
    (user?.user_metadata?.locale as string | undefined) ?? null,
  );
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("Confirmação recebida")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Se o link de confirmação foi enviado aos dois endereços, abra os dois. Depois disso, entre com o novo e-mail.",
          )}
        </p>
      </div>
      <p className="text-center text-sm">
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          {t("Ir para o login")}
        </Link>
      </p>
    </div>
  );
}
