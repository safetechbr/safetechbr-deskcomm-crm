/** GET /api/v1/fiscal/documentos — lista as notas da loja (filtros: status, operacao, de, ate, q = placa/chassi). */
import { type NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/wrappers";
import { COLUNAS_LISTA, guardaFiscal } from "@/lib/fiscal/rota";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await guardaFiscal("agent", false);
  if (!g.ok) return g.response;
  const p = req.nextUrl.searchParams;
  let q = g.admin.from("documentos_fiscais").select(COLUNAS_LISTA).eq("organization_id", g.org)
    .order("created_at", { ascending: false }).limit(200);
  const status = p.get("status"), operacao = p.get("operacao"), de = p.get("de"), ate = p.get("ate");
  if (status) q = q.eq("status", status);
  if (operacao) q = q.eq("operacao", operacao);
  if (de) q = q.gte("created_at", de);
  if (ate) q = q.lte("created_at", `${ate}T23:59:59.999-03:00`);
  const { data, error } = await q;
  if (error) return fail("internal_error", "Erro ao listar as notas.", 500, { requestId: g.requestId });
  // Placa/chassi moram no jsonb do rascunho; filtra aqui (limite de 200 linhas).
  const busca = (p.get("q") ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  const linhas = busca
    ? (data ?? []).filter((d) => {
        const v = (d.rascunho as { veiculo?: { placa?: string; chassi?: string } } | null)?.veiculo;
        return `${v?.placa ?? ""}${v?.chassi ?? ""}`.toUpperCase().replace(/[^A-Z0-9]/g, "").includes(busca);
      })
    : data ?? [];
  return ok(linhas, { requestId: g.requestId });
}
