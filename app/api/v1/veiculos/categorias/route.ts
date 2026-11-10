/**
 * GET /api/v1/veiculos/categorias — lista para o seletor do cadastro:
 * as categorias padrão + as que a loja já acrescentou.
 */
import { randomUUID } from "node:crypto";

import { ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { categoriasParaSeletor } from "@/lib/veiculos/categorias-da-loja";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "veiculos" });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  return ok(await categoriasParaSeletor(supabase, authz.org.orgId), { requestId });
}
