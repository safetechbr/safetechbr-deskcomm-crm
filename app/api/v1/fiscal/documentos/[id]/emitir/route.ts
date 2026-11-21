/** POST emite (ou reemite após correção) uma nota em rascunho/rejeitada. */
import { type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { emitirDocumento } from "@/lib/fiscal/emitir";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { guardaFiscal } from "@/lib/fiscal/rota";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const negado = await requireSupportWrite();
  if (negado) return negado;
  const g = await guardaFiscal("manager", false);
  if (!g.ok) return g.response;
  const { id } = await params;
  const r = await emitirDocumento(g.admin, g.org, id, g.userId);
  if (!r.ok) {
    const http = r.code === "not_found" ? 404 : r.code === "upstream_error" ? 502 : r.code === "validation_failed" ? 422 : 409;
    return fail(r.code, r.message, http, { requestId: g.requestId, details: r.erros ? { pendencias: r.erros } : undefined });
  }
  await audit({ organizationId: g.org, actorUserId: g.userId, action: "fiscal.documento_emitido", resourceType: "documentos_fiscais", resourceId: id, requestId: g.requestId, metadata: { status: r.status } });
  return ok(r, { requestId: g.requestId });
}
