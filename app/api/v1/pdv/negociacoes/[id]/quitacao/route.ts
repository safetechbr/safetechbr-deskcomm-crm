/**
 * GET /api/v1/pdv/negociacoes/:id/quitacao — o Termo de Quitação Total em PDF
 * (inline). Só sai com a venda concluída e nada pendente, banco incluso (409).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { carregarDocumentosDePagamento, lojaDaNegociacao } from "@/lib/pdv/documentos-de-pagamento";
import { situacaoDaQuitacao } from "@/lib/pdv/recibo-pagamento";
import { renderQuitacaoPdf } from "@/lib/pdv/recibo-pagamento-pdf";
import { formatarPreco } from "@/lib/veiculos/regras";
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
  let buffer: Buffer;
  let numero: number;
  try {
    const docs = await carregarDocumentosDePagamento(supabase, authz.org.orgId, id);
    if (!docs) return fail("not_found", traduzir("Negociação não encontrada.", authz.user.idioma), 404, { requestId });
    const s = situacaoDaQuitacao(docs.negociacao, docs.lancamentos);
    if (!s.quitada)
      return fail(
        "conflict",
        s.pendente_cents > 0
          ? `Ainda falta receber ${formatarPreco(s.pendente_cents)}.`
          : "A venda precisa estar concluída e com pagamentos lançados.",
        409,
        { requestId },
      );
    const loja = await lojaDaNegociacao(supabase, authz.org.orgId, docs.negociacao);
    buffer = await renderQuitacaoPdf({ ...docs, loja });
    numero = docs.negociacao.numero;
  } catch {
    return fail("internal_error", "Erro ao gerar o termo de quitação.", 500, { requestId });
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=quitacao-${numero}.pdf`,
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}
