import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { marcasDoCatalogo, modelosDaMarca } from "@/lib/veiculos/catalogo";

/**
 * GET /api/v1/veiculos/catalogo            → { marcas: [...] }
 * GET /api/v1/veiculos/catalogo?marca=Fiat&q=pulse → { modelos: [nomes FIPE] }
 * Só para o cadastro de estoque (manager+).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "veiculos" });
  if (!authz.ok) return authz.response;
  const marca = req.nextUrl.searchParams.get("marca");
  if (!marca) return ok({ marcas: marcasDoCatalogo() }, { requestId });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return ok({ modelos: modelosDaMarca(marca, q.slice(0, 80)) }, { requestId });
}
