import { RenaveErro, type CodigoErroRenave, type RegistrarChamada } from "../tipos";

export const URL_BASE_PADRAO = "https://api.renavefacil.net/v2/integration";
export const TIMEOUT_MS = 30_000;
export const MAX_TENTATIVAS = 3;

const ERRO_POR_STATUS: Record<number, CodigoErroRenave> = {
  400: "renave_validacao", 401: "renave_auth", 403: "renave_nao_vinculado",
  404: "renave_nao_cadastrado", 409: "renave_ja_cadastrado", 429: "renave_limite",
};

export function erroDoStatus(status: number, texto: string): RenaveErro {
  const codigo = ERRO_POR_STATUS[status] ?? (status >= 500 ? "renave_indisponivel" : "renave_validacao");
  return new RenaveErro(codigo, status, texto || `http_${status}`);
}

/** Só 429, 5xx e falha de rede/timeout repetem. */
export const repetivel = (e: RenaveErro): boolean => e.codigo === "renave_limite" || e.codigo === "renave_indisponivel";

/** Backoff exponencial com jitter: 500ms, 1s, 2s (+ até 250ms). */
export const esperaMs = (tentativa: number, rnd = Math.random): number => 500 * 2 ** tentativa + Math.floor(rnd() * 250);

export interface OpcoesHttp {
  apiKey: string;
  urlBase?: string;
  registrar?: RegistrarChamada;
  /** Injetáveis para teste. */
  fetchImpl?: typeof fetch;
  dormir?: (ms: number) => Promise<void>;
}

export interface Resposta {
  status: number;
  json: unknown;
}

export async function chamar(
  o: OpcoesHttp,
  metodo: "GET" | "POST" | "PUT",
  caminho: string,
  modelo: string,
  corpo?: unknown,
): Promise<Resposta> {
  const f = o.fetchImpl ?? fetch;
  const dormir = o.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const url = `${(o.urlBase ?? URL_BASE_PADRAO).replace(/\/$/, "")}${caminho}`;
  let ultimo: RenaveErro | null = null;

  for (let t = 0; t < MAX_TENTATIVAS; t++) {
    const t0 = Date.now();
    try {
      const res = await f(url, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${o.apiKey}`,
          ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const texto = await res.text().catch(() => "");
      await o.registrar?.({ endpoint: modelo, metodo, status: res.status, ms: Date.now() - t0, erro: res.ok ? undefined : `http_${res.status}` });
      let json: unknown = null;
      try { json = texto ? JSON.parse(texto) : null; } catch { json = null; }
      if (res.ok) return { status: res.status, json };
      const msg = json && typeof json === "object" && "message" in json ? String((json as { message: unknown }).message) : "";
      ultimo = erroDoStatus(res.status, msg.slice(0, 300));
    } catch (e) {
      const erro = e instanceof Error ? e.message : "rede";
      await o.registrar?.({ endpoint: modelo, metodo, status: null, ms: Date.now() - t0, erro });
      ultimo = new RenaveErro("renave_indisponivel", null, erro);
    }
    if (!repetivel(ultimo) || t === MAX_TENTATIVAS - 1) throw ultimo;
    await dormir(esperaMs(t));
  }
  throw ultimo ?? new RenaveErro("renave_indisponivel", null, "falha");
}
