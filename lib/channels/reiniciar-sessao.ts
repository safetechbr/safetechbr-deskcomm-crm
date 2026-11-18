import { CHANNEL_PROVIDER_WAHA } from "@/lib/channels/capabilities";

/** O único transporte cuja sessão o watcher de silêncio sabe reiniciar. */
export const PROVIDER_REINICIAVEL = CHANNEL_PROVIDER_WAHA;

/** Restart da sessão no WAHA. Falha vira `false`, nunca exceção. */
export async function reiniciarSessao(nome: string): Promise<boolean> {
  const base = process.env.WAHA_API_BASE_URL;
  const chave = process.env.WAHA_API_KEY;
  if (!base || !chave) return false;
  try {
    const res = await fetch(`${base}/api/sessions/${encodeURIComponent(nome)}/restart`, {
      method: "POST",
      headers: { "X-Api-Key": chave },
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
