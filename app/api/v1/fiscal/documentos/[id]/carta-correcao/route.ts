/** POST carta de correção (só texto; não corrige valor, CFOP, destinatário nem data). */
import { type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { carregarConfigComContexto } from "@/lib/fiscal/config-servidor";
import { FocusNfeProvider } from "@/lib/fiscal/focus/provider";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { guardaFiscal } from "@/lib/fiscal/rota";

export const dynamic = "force-dynamic";
const corpo = z.object({ texto: z.string().trim().min(15, "O texto precisa ter pelo menos 15 caracteres.").max(1000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const negado = await requireSupportWrite();
  if (negado) return negado;
  const g = await guardaFiscal("manager", false);
  if (!g.ok) return g.response;
  const { id } = await params;
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", parsed.error.issues[0]?.message ?? "Dados inválidos.", 422, { requestId: g.requestId });
  const { data: doc } = await g.admin.from("documentos_fiscais").select("id, status, ref_provider").eq("id", id).eq("organization_id", g.org).maybeSingle();
  if (!doc) return fail("not_found", "Nota não encontrada.", 404, { requestId: g.requestId });
  if (doc.status !== "autorizada" || !doc.ref_provider) return fail("conflict", "Só nota autorizada aceita carta de correção.", 409, { requestId: g.requestId });
  const carregada = await carregarConfigComContexto(g.admin, g.org);
  if (!carregada?.ctx) return fail("conflict", "Configure os dados fiscais da loja primeiro.", 409, { requestId: g.requestId });
  const res = await new FocusNfeProvider().cartaCorrecao(carregada.ctx, doc.ref_provider, parsed.data.texto).catch(() => null);
  if (!res) return fail("upstream_error", "O provedor fiscal não respondeu. Tente de novo.", 502, { requestId: g.requestId });
  const { count } = await g.admin.from("documento_fiscal_eventos").select("id", { count: "exact", head: true })
    .eq("documento_id", id).eq("organization_id", g.org).eq("tipo", "cce");
  await g.admin.from("documento_fiscal_eventos").insert({
    organization_id: g.org, documento_id: id, tipo: "cce", sequencia: (count ?? 0) + 1, texto: parsed.data.texto, protocolo: res.protocolo,
    status: res.ok ? "aceito" : "rejeitado", retorno_provider: res.bruto ?? null, created_by: g.userId,
  });
  await audit({ organizationId: g.org, actorUserId: g.userId, action: "fiscal.carta_correcao", resourceType: "documentos_fiscais", resourceId: id, requestId: g.requestId, metadata: { ok: res.ok } });
  if (!res.ok) return fail("conflict", res.rejeicao?.explicacao ?? "A SEFAZ recusou a carta de correção.", 409, { requestId: g.requestId });
  return ok({ id }, { requestId: g.requestId });
}
