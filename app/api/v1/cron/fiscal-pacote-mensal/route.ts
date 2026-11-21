/**
 * GET|POST /api/v1/cron/fiscal-pacote-mensal — gera e envia ao contador o pacote
 * do mês anterior. Roda todo dia e é idempotente: quem já tem o pacote do mês
 * anterior é pulado. Auth: `Authorization: Bearer <INTERNAL_CRON_SECRET>`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { gerarPacoteMensal } from "@/lib/fiscal/pacote-mensal";
import { logger } from "@/lib/logger";
import { idsDeOrgsParadas } from "@/lib/organizacao/operante";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TANDA = 10;

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  const admin = createAdminClient();
  const paradas = new Set(await idsDeOrgsParadas(admin));

  const agora = new Date();
  const anterior = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 1));
  const competencia = `${anterior.getUTCFullYear()}-${String(anterior.getUTCMonth() + 1).padStart(2, "0")}`;

  const { data: lojas, error } = await admin.from("config_fiscal_loja")
    .select("organization_id").eq("ativo", true).not("email_contador", "is", null);
  if (error) {
    logger.error("[fiscal-pacote-mensal] leitura falhou", { error: error.message, requestId });
    return fail("internal_error", "fiscal_pacote_mensal_failed", 500, { requestId });
  }
  const { data: feitos } = await admin.from("fiscal_pacotes_mensais")
    .select("organization_id").eq("competencia", `${competencia}-01`).not("enviado_em", "is", null);
  const jaFeitos = new Set((feitos ?? []).map((f) => f.organization_id as string));

  let gerados = 0;
  let falhas = 0;
  for (const l of lojas ?? []) {
    const org = l.organization_id as string;
    if (paradas.has(org) || jaFeitos.has(org)) continue;
    if (gerados + falhas >= TANDA) break;
    const r = await gerarPacoteMensal(admin, org, competencia, { enviar: true });
    if (r.ok) {
      gerados++;
      await audit({ organizationId: org, bypassedRls: true, action: "fiscal.pacote_mensal", resourceType: "fiscal_pacotes_mensais",
        resourceId: null, requestId, metadata: { competencia, origem: "cron", qtd_notas: r.qtdNotas, enviado_para: r.enviadoPara } });
    } else if (r.erro !== "sem_notas") {
      falhas++;
      logger.error("[fiscal-pacote-mensal] falhou", { org, competencia, erro: r.erro, requestId });
    }
  }
  return ok({ competencia, gerados, falhas }, { requestId });
}

export const GET = handle;
export const POST = handle;
