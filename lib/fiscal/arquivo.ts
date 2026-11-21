/** Baixa XML ou DANFE de uma nota autorizada/cancelada pelo provedor. */
import { fail } from "@/lib/api/wrappers";
import { carregarConfigComContexto } from "./config-servidor";
import { FocusNfeProvider } from "./focus/provider";
import { guardaFiscal } from "./rota";

export async function baixarArquivo(id: string, tipo: "xml" | "danfe"): Promise<Response> {
  const g = await guardaFiscal("agent", false);
  if (!g.ok) return g.response;
  const { data: doc } = await g.admin.from("documentos_fiscais").select("numero, status, ref_provider").eq("id", id).eq("organization_id", g.org).maybeSingle();
  if (!doc) return fail("not_found", "Nota não encontrada.", 404, { requestId: g.requestId });
  if (!doc.ref_provider || !["autorizada", "cancelada"].includes(doc.status))
    return fail("conflict", "A nota ainda não foi autorizada.", 409, { requestId: g.requestId });
  const c = await carregarConfigComContexto(g.admin, g.org);
  if (!c?.ctx) return fail("conflict", "Configure os dados fiscais da loja primeiro.", 409, { requestId: g.requestId });
  const p = new FocusNfeProvider();
  const bytes = await (tipo === "xml" ? p.baixarXml(c.ctx, doc.ref_provider) : p.baixarDanfe(c.ctx, doc.ref_provider)).catch(() => null);
  if (!bytes) return fail("upstream_error", "Não foi possível baixar o arquivo agora.", 502, { requestId: g.requestId });
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": tipo === "xml" ? "application/xml" : "application/pdf",
      "Content-Disposition": `attachment; filename="nfe-${doc.numero ?? id}.${tipo === "xml" ? "xml" : "pdf"}"`,
    },
  });
}
