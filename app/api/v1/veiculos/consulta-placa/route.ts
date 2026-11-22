/**
 * GET /api/v1/veiculos/consulta-placa?placa=ABC1D23 — preenche o cadastro de
 * veículo a partir da placa (API Placas, consulta básica). Cache em memória
 * por placa (24 h): digitar a mesma placa de novo não gasta outra consulta paga.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { env } from "@/lib/env";
import { traduzir } from "@/lib/i18n/dicionario";
import { type DadosDaPlaca, lerRespostaDaPlaca, normalizarPlaca, placaValida } from "@/lib/veiculos/placa";

export const dynamic = "force-dynamic";

const URL_BASE = "https://apiplacas.com.br/v3/basico";
const TTL_MS = 24 * 60 * 60 * 1000;
// shortcut: cache por processo (some no redeploy, não é compartilhado entre instâncias); subir para tabela/Redis se o custo pesar.
const cache = new Map<string, { em: number; dados: DadosDaPlaca }>();

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "veiculos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const placa = normalizarPlaca(req.nextUrl.searchParams.get("placa") ?? "");
  if (!placaValida(placa)) return fail("validation_failed", t("Placa inválida."), 422, { requestId });

  const token = env.APIPLACAS_TOKEN;
  if (!token) return fail("not_configured", t("Consulta de placa não configurada."), 503, { requestId });

  const guardado = cache.get(placa);
  if (guardado && Date.now() - guardado.em < TTL_MS) return ok(guardado.dados, { requestId });

  const teto = await checkRateLimit(`placa:org:${authz.org.orgId}`, 30, 60);
  if (!teto.allowed) {
    return fail("rate_limited", t("Muitas consultas. Tente em instantes."), 429, {
      requestId,
      headers: { "Retry-After": "60" },
    });
  }

  let json: unknown = null;
  try {
    const r = await fetch(`${URL_BASE}/${placa}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (r.status === 404) return fail("not_found", t("Placa não encontrada."), 404, { requestId });
    if (!r.ok) return fail("bad_gateway", t("Serviço de placa indisponível."), 502, { requestId });
    json = await r.json().catch(() => null);
  } catch {
    return fail("bad_gateway", t("Serviço de placa indisponível."), 502, { requestId });
  }

  const dados = lerRespostaDaPlaca(json);
  if (!dados) return fail("not_found", t("Placa não encontrada."), 404, { requestId });
  cache.set(placa, { em: Date.now(), dados });
  return ok(dados, { requestId });
}
