/**
 * GET /api/v1/pdv/negociacoes/:id/recibos — recibos emitidos da venda e se o
 * termo de quitação já pode sair.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { carregarDocumentosDePagamento } from "@/lib/pdv/documentos-de-pagamento";
import { saldoAposRecibo, situacaoDaQuitacao } from "@/lib/pdv/recibo-pagamento";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "negociacoes_de_veiculo" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return fail("validation_failed", "Negociação inválida.", 422, { requestId });

  let docs;
  try {
    docs = await carregarDocumentosDePagamento(await createClient(), authz.org.orgId, id);
  } catch {
    return fail("internal_error", "Erro ao ler os recibos.", 500, { requestId });
  }
  if (!docs) return fail("not_found", traduzir("Negociação não encontrada.", authz.user.idioma), 404, { requestId });

  const { negociacao, lancamentos, recibos } = docs;
  return ok(
    {
      recibos: recibos.map((r) => ({ ...r, saldo_cents: saldoAposRecibo(r, lancamentos, recibos) })),
      ...situacaoDaQuitacao(negociacao, lancamentos),
    },
    { requestId },
  );
}
