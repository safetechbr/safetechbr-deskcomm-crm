/**
 * Cliente HTTP mínimo da Focus NFe v2. Autenticação Basic: token como usuário,
 * senha vazia. O token nunca é logado nem entra em mensagem de erro.
 */
import type { Ambiente } from "../provider";

export const FOCUS_URL: Record<Ambiente, string> = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RespostaFocus {
  http: number;
  json: Record<string, unknown>;
}

const TIMEOUT_MS = 30_000;

const basic = (token: string) => `Basic ${Buffer.from(`${token}:`).toString("base64")}`;

export async function chamarFocus(
  fetchImpl: FetchLike,
  baseUrl: string,
  token: string,
  metodo: "GET" | "POST" | "DELETE",
  caminho: string,
  corpo?: unknown,
): Promise<RespostaFocus> {
  const res = await fetchImpl(`${baseUrl}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: basic(token),
      ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const texto = await res.text();
  let json: Record<string, unknown> = {};
  try {
    const p = texto ? JSON.parse(texto) : {};
    if (p && typeof p === "object" && !Array.isArray(p)) json = p as Record<string, unknown>;
  } catch {
    json = { mensagem: texto.slice(0, 300) };
  }
  return { http: res.status, json };
}

/** Baixa um arquivo (XML/DANFE). Caminho relativo usa a base e a autenticação; URL absoluta vai sem credencial. */
export async function baixarArquivo(
  fetchImpl: FetchLike,
  baseUrl: string,
  token: string,
  caminhoOuUrl: string,
): Promise<Uint8Array> {
  const absoluta = /^https?:\/\//i.test(caminhoOuUrl);
  const res = await fetchImpl(absoluta ? caminhoOuUrl : `${baseUrl}${caminhoOuUrl}`, {
    headers: absoluta ? {} : { Authorization: basic(token) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Falha ao baixar o arquivo (HTTP ${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}
