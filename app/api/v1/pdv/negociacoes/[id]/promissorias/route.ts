/**
 * GET /api/v1/pdv/negociacoes/:id/promissorias — notas promissórias da venda
 * (uma por parcela paga direto à loja) e o que falta para emiti-las.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { carregarDocumentosDePagamento, lojaDaNegociacao } from "@/lib/pdv/documentos-de-pagamento";
import { faltasDaNota, notasPromissorias, temNotaPromissoria } from "@/lib/pdv/nota-promissoria";
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

  const supabase = await createClient();
  try {
    const docs = await carregarDocumentosDePagamento(supabase, authz.org.orgId, id);
    if (!docs)
      return fail("not_found", traduzir("Negociação não encontrada.", authz.user.idioma), 404, { requestId });
    const { negociacao, lancamentos } = docs;
    if (!temNotaPromissoria(negociacao)) return ok({ notas: [], faltas: [] }, { requestId });
    const loja = await lojaDaNegociacao(supabase, authz.org.orgId, negociacao);
    return ok(
      { notas: notasPromissorias(negociacao, lancamentos), faltas: faltasDaNota(negociacao, loja) },
      { requestId },
    );
  } catch {
    return fail("internal_error", "Erro ao ler as notas promissórias.", 500, { requestId });
  }
}
