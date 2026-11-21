/**
 * POST /api/v1/webhooks/focus?s=<webhook_segredo> — aviso de mudança de status da Focus NFe.
 *
 * O aviso só ACORDA a leitura: o corpo não é confiado. A rota acha a loja pelo
 * segredo (por loja, gerado em `config_fiscal_loja`), pega o `ref` e RELÊ o
 * documento na API do provedor antes de gravar. Segredo errado → 404 (não
 * confirma que a rota existe). Falha ao reler → 503 e a Focus reenvia; o cron
 * `fiscal-consulta` cobre o que escapar.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { timingSafeStringEqual } from "@/lib/auth/cron-auth";
import { aplicarResultado } from "@/lib/fiscal/aplicar-resultado";
import { carregarConfigComContexto } from "@/lib/fiscal/config-servidor";
import { FocusNfeProvider } from "@/lib/fiscal/focus/provider";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const LIMITE_DO_CORPO = 262_144;
const RECUSAS_POR_MINUTO = 60;

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  const naoExiste = () => fail("not_found", "Not found", 404, { requestId });
  const admin = createAdminClient();

  const segredo = req.nextUrl.searchParams.get("s") ?? "";
  const recusar = async () => {
    const balde = ipDoCliente(req.headers) ?? "sem-proxy";
    const taxa = await checkRateLimit(`focus-webhook-recusado:${balde}`, RECUSAS_POR_MINUTO, 60);
    if (!taxa.allowed) return fail("rate_limited", "Muitos avisos recusados.", 429, { requestId, headers: { "Retry-After": "60" } });
    return naoExiste();
  };
  if (!/^[0-9a-f]{48}$/.test(segredo)) return recusar();

  const { data: loja } = await admin.from("config_fiscal_loja").select("organization_id, webhook_segredo")
    .eq("webhook_segredo", segredo).maybeSingle();
  if (!loja || !timingSafeStringEqual(String(loja.webhook_segredo), segredo)) return recusar();
  const org = loja.organization_id as string;

  if (Number(req.headers.get("content-length") ?? "0") > LIMITE_DO_CORPO) {
    return fail("payload_too_large", "Aviso grande demais.", 413, { requestId });
  }
  const texto = await req.text();
  if (Buffer.byteLength(texto, "utf8") > LIMITE_DO_CORPO) {
    return fail("payload_too_large", "Aviso grande demais.", 413, { requestId });
  }
  let ref = "";
  try {
    const corpo = JSON.parse(texto) as { ref?: unknown };
    ref = typeof corpo.ref === "string" ? corpo.ref : "";
  } catch {
    return fail("validation_failed", "Corpo inválido.", 422, { requestId });
  }
  if (!ref) return fail("validation_failed", "Aviso sem referência.", 422, { requestId });

  // O filtro por organização impede que o segredo de uma loja toque nota de outra.
  const { data: doc } = await admin.from("documentos_fiscais").select("id, organization_id, status, rascunho, numero")
    .eq("organization_id", org).eq("ref_provider", ref).maybeSingle();
  if (!doc) return ok({ ignorado: "documento_desconhecido" }, { requestId });

  const carregada = await carregarConfigComContexto(admin, org);
  if (!carregada?.ctx) return ok({ ignorado: "loja_sem_provedor" }, { requestId });
  try {
    const r = await new FocusNfeProvider().consultarNfe(carregada.ctx, ref);
    const mudou = await aplicarResultado(admin, doc, r);
    if (mudou) {
      await audit({ organizationId: org, bypassedRls: true, action: "fiscal.documento_atualizado",
        resourceType: "documentos_fiscais", resourceId: doc.id as string, requestId,
        metadata: { origem: "webhook_focus", de: doc.status, para: r.status } });
    }
    return ok({ recebido: true }, { requestId });
  } catch (e) {
    logger.error("[webhook/focus] releitura falhou", { error: e instanceof Error ? e.message : "erro", requestId });
    return fail("unavailable", "Tente de novo em instantes.", 503, { requestId });
  }
}
