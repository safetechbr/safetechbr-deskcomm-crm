/**
 * GET /api/v1/pdv/negociacoes/:id/recibos/:numero — o recibo de pagamento em PDF
 * (inline). O saldo é recalculado a cada impressão, sempre no instante do recibo.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { carregarDocumentosDePagamento, lojaDaNegociacao } from "@/lib/pdv/documentos-de-pagamento";
import { renderReciboPdf } from "@/lib/pdv/recibo-pagamento-pdf";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; numero: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "negociacoes_de_veiculo" });
  if (!authz.ok) return authz.response;
  const { id, numero } = await params;
  const num = z.coerce.number().int().positive().safeParse(numero);
  if (!z.string().uuid().safeParse(id).success || !num.success)
    return fail("validation_failed", "Recibo inválido.", 422, { requestId });

  const supabase = await createClient();
  let buffer: Buffer;
  try {
    const docs = await carregarDocumentosDePagamento(supabase, authz.org.orgId, id);
    const recibo = docs?.recibos.find((r) => r.numero === num.data);
    if (!docs || !recibo)
      return fail("not_found", traduzir("Recibo não encontrado.", authz.user.idioma), 404, { requestId });
    const loja = await lojaDaNegociacao(supabase, authz.org.orgId, docs.negociacao);
    buffer = await renderReciboPdf({ ...docs, loja, recibo });
  } catch {
    return fail("internal_error", "Erro ao gerar o recibo.", 500, { requestId });
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=recibo-${num.data}.pdf`,
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}
