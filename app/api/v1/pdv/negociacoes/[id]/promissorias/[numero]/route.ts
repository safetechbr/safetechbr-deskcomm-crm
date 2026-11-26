/**
 * GET /api/v1/pdv/negociacoes/:id/promissorias/:numero — a nota promissória em
 * PDF (inline). `todas` imprime todas as notas da venda num arquivo só.
 * Título de crédito não sai com campo em branco: faltando dado, responde 422.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { carregarDocumentosDePagamento, lojaDaNegociacao } from "@/lib/pdv/documentos-de-pagamento";
import { faltasDaNota, notasPromissorias, temNotaPromissoria } from "@/lib/pdv/nota-promissoria";
import { renderNotasPromissoriasPdf } from "@/lib/pdv/nota-promissoria-pdf";
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
  const num = numero === "todas" ? { success: true as const, data: null } : z.coerce.number().int().positive().safeParse(numero);
  if (!z.string().uuid().safeParse(id).success || !num.success)
    return fail("validation_failed", "Nota promissória inválida.", 422, { requestId });

  const supabase = await createClient();
  let buffer: Buffer;
  try {
    const docs = await carregarDocumentosDePagamento(supabase, authz.org.orgId, id);
    const todas = docs && temNotaPromissoria(docs.negociacao) ? notasPromissorias(docs.negociacao, docs.lancamentos) : [];
    const notas = num.data == null ? todas : todas.filter((n) => n.numero === num.data);
    if (!docs || !notas.length)
      return fail("not_found", traduzir("Nota promissória não encontrada.", authz.user.idioma), 404, { requestId });
    const loja = await lojaDaNegociacao(supabase, authz.org.orgId, docs.negociacao);
    const faltas = faltasDaNota(docs.negociacao, loja);
    if (faltas.length)
      return fail("validation_failed", faltas.map((f) => f.mensagem).join(" "), 422, { requestId });
    buffer = await renderNotasPromissoriasPdf({ negociacao: docs.negociacao, loja, notas });
  } catch {
    return fail("internal_error", "Erro ao gerar a nota promissória.", 500, { requestId });
  }

  const nome = num.data == null ? "notas-promissorias" : `nota-promissoria-${num.data}`;
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=${nome}.pdf`,
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}
