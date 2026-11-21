/**
 * GET|POST /api/v1/cron/renave-fila — envia a fila do RENAVE (com retentativa) e
 * arquiva XML/DANFE de notas autorizadas que ainda não foram guardadas.
 * Auth: `Authorization: Bearer <INTERNAL_CRON_SECRET>` (fail-closed).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { arquivarDocumento } from "@/lib/fiscal/arquivar";
import { logger } from "@/lib/logger";
import { idsDeOrgsParadas } from "@/lib/organizacao/operante";
import { processarFilaRenave } from "@/lib/renave/fila";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TANDA = 20;

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  const admin = createAdminClient();

  const fila = await processarFilaRenave(admin, TANDA);

  const paradas = new Set(await idsDeOrgsParadas(admin));
  const { data: sem, error } = await admin.from("documentos_fiscais")
    .select("id, organization_id").eq("status", "autorizada").is("xml_storage_path", null)
    .order("autorizada_em").limit(TANDA);
  if (error) logger.error("[renave-fila] leitura falhou", { error: error.message, requestId });
  let arquivadas = 0;
  for (const d of sem ?? []) {
    if (paradas.has(d.organization_id as string)) continue;
    const r = await arquivarDocumento(admin, d.organization_id as string, d.id as string);
    if (r.ok) {
      arquivadas++;
      await audit({ organizationId: d.organization_id as string, bypassedRls: true, action: "fiscal.arquivo_guardado",
        resourceType: "documentos_fiscais", resourceId: d.id as string, requestId, metadata: { origem: "cron_renave_fila" } });
    }
  }
  return ok({ ...fila, arquivadas }, { requestId });
}

export const GET = handle;
export const POST = handle;
