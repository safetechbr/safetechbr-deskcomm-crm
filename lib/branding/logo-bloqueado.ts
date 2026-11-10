import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * A trava do logo das empresas.
 *
 * Ligada (padrão), nenhuma organização troca o logo: todas mostram o da
 * instalação, que é o do revendedor. Só o admin mestre desliga, em
 * `/admin/marca`. Vive em `platform_branding.logo_bloqueado` (migration 9035).
 *
 * Falha FECHADA: sem linha, sem coluna (banco ainda sem a migration) ou erro de
 * leitura, vale "bloqueado". Quem pode ser surpreendido é o revendedor, não a
 * empresa — e o logo do revendedor nunca some por um erro de leitura.
 *
 * Memo curto por processo, no mesmo desenho de `marcaDaInstalacao`: o layout do
 * app lê isto a cada render.
 */
const TTL_MS = 15_000;
let memo: { valor: boolean; em: number } | null = null;

export function invalidarTravaDoLogo(): void {
  memo = null;
}

export async function logoDasEmpresasBloqueado(): Promise<boolean> {
  if (memo && Date.now() - memo.em < TTL_MS) return memo.valor;
  try {
    const { data, error } = await createAdminClient()
      .from("platform_branding")
      .select("logo_bloqueado")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      logger.warn("[branding] não consegui ler a trava do logo; tratando como bloqueado", {
        code: error.code,
      });
      return true;
    }
    const valor = data?.logo_bloqueado !== false;
    memo = { valor, em: Date.now() };
    return valor;
  } catch {
    return true;
  }
}

/** Tira da configuração da organização o que ela subiu de logo. */
export function semOsLogosDaOrganizacao(settings: unknown): unknown {
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) return settings;
  const s = settings as Record<string, unknown>;
  const b = s.branding;
  if (typeof b !== "object" || b === null || Array.isArray(b)) return settings;
  const { logo_path: _a, logo_dark_path: _b, ...resto } = b as Record<string, unknown>;
  return { ...s, branding: resto };
}
