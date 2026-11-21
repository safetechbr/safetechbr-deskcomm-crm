/** POST inutiliza uma faixa de numeração (série, número inicial e final, justificativa ≥ 15 caracteres). */
import { type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { carregarConfigComContexto } from "@/lib/fiscal/config-servidor";
import { FocusNfeProvider } from "@/lib/fiscal/focus/provider";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { guardaFiscal } from "@/lib/fiscal/rota";

export const dynamic = "force-dynamic";
const corpo = z.object({
  serie: z.number().int().min(0).max(999),
  numero_inicial: z.number().int().min(1),
  numero_final: z.number().int().min(1),
  justificativa: z.string().trim().min(15, "A justificativa precisa ter pelo menos 15 caracteres.").max(255),
}).refine((c) => c.numero_final >= c.numero_inicial, { message: "O número final não pode ser menor que o inicial." });

export async function POST(req: NextRequest) {
  const negado = await requireSupportWrite();
  if (negado) return negado;
  const g = await guardaFiscal("manager", false);
  if (!g.ok) return g.response;
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", parsed.error.issues[0]?.message ?? "Dados inválidos.", 422, { requestId: g.requestId });
  const c = parsed.data;
  const carregada = await carregarConfigComContexto(g.admin, g.org);
  if (!carregada?.ctx) return fail("conflict", "Configure os dados fiscais da loja primeiro.", 409, { requestId: g.requestId });
  const res = await new FocusNfeProvider().inutilizar(carregada.ctx, c.serie, c.numero_inicial, c.numero_final, c.justificativa).catch(() => null);
  if (!res) return fail("upstream_error", "O provedor fiscal não respondeu. Tente de novo.", 502, { requestId: g.requestId });
  await g.admin.from("documento_fiscal_eventos").insert({
    organization_id: g.org, tipo: "inutilizacao", texto: c.justificativa, protocolo: res.protocolo, status: res.ok ? "aceito" : "rejeitado",
    serie: c.serie, numero_inicial: c.numero_inicial, numero_final: c.numero_final, retorno_provider: res.bruto ?? null, created_by: g.userId,
  });
  await audit({ organizationId: g.org, actorUserId: g.userId, action: "fiscal.numeracao_inutilizada", resourceType: "documentos_fiscais", resourceId: null, requestId: g.requestId, metadata: { serie: c.serie, de: c.numero_inicial, ate: c.numero_final, ok: res.ok } });
  if (!res.ok) return fail("conflict", res.rejeicao?.explicacao ?? "A SEFAZ recusou a inutilização.", 409, { requestId: g.requestId });
  return ok({ ok: true }, { requestId: g.requestId });
}
