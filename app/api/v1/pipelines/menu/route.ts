/**
 * GET /api/v1/pipelines/menu — os funis vivos da organização ativa, só o
 * suficiente para o submenu "Funis" da barra lateral (id, nome, padrão).
 *
 * Existe porque `GET /api/v1/pipelines` exige `manager` e a barra lateral é
 * desenhada para QUALQUER papel: um `agent` (o vendedor) levaria 403 e ficaria
 * sem atalho. Leitura aberta a `agent`, como `/pipelines/default` — a lista de
 * funis já é aberta a todos na tela de Funis. Arquivado não entra.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "pipelines" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_pipelines")
    .select("id, name, is_default")
    .eq("organization_id", authz.org.orgId)
    .eq("is_archived", false)
    .order("position", { ascending: true });
  if (error) return fail("internal_error", error.message, 500, { requestId });

  return ok(
    { pipelines: (data ?? []) as Array<{ id: string; name: string; is_default: boolean }> },
    { requestId },
  );
}
