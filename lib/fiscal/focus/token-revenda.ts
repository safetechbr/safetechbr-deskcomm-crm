/**
 * O token de revenda da Focus NFe em vigor: banco (tela /admin/fiscal) primeiro,
 * `FOCUS_TOKEN_REVENDA` do `.env` como piso de rollback. Nunca lança — falha de
 * leitura/decifra cai para o ambiente, e "" significa "não configurado".
 */
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

export async function tokenRevendaFocus(): Promise<string> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_fiscal_focus")
      .select("token_revenda_encrypted")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      // 42P01 = clone sem a migration 9059: o `.env` assume.
      logger.info("[fiscal.focus] sem token no banco; vale o .env", { codigo: error.code });
    } else {
      const cifrado = (data as { token_revenda_encrypted?: string | null } | null)?.token_revenda_encrypted;
      if (cifrado) {
        const claro = (await decryptWebhookSecret(admin, cifrado))?.trim();
        if (claro) return claro;
        logger.warn("[fiscal.focus] token do banco não decifrou; vale o .env");
      }
    }
  } catch (err) {
    logger.warn("[fiscal.focus] leitura do banco falhou; vale o .env", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return env.FOCUS_TOKEN_REVENDA.trim();
}
