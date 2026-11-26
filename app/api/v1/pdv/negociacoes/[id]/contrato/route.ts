/**
 * GET /api/v1/pdv/negociacoes/:id/contrato — o contrato da negociação em PDF
 * (inline, para abrir numa aba e imprimir). Sai das FOTOGRAFIAS gravadas na
 * negociação, então reimprimir depois dá o mesmo documento.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { renderContratoPdf } from "@/lib/pdv/contrato";
import { lojaDaNegociacao } from "@/lib/pdv/documentos-de-pagamento";
import { COLUNAS_DA_NEGOCIACAO, type Negociacao } from "@/lib/pdv/regras";
import { decidirVersaoDoContrato } from "@/lib/pdv/versao-do-contrato";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "negociacoes_de_veiculo" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return fail("validation_failed", "Negociação inválida.", 422, { requestId });

  const supabase = await createClient();
  const { data } = await supabase
    .from("negociacoes_de_veiculo")
    .select(COLUNAS_DA_NEGOCIACAO)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return fail("not_found", t("Negociação não encontrada."), 404, { requestId });
  const negociacao = data as unknown as Negociacao;

  const loja = await lojaDaNegociacao(supabase, authz.org.orgId, negociacao);

  // Só o modelo com fotografia contratual tem minuta/assinatura; o histórico segue igual.
  const decisao = negociacao.contrato?.empresa ? decidirVersaoDoContrato(negociacao) : undefined;

  let buffer: Buffer;
  try {
    buffer = await renderContratoPdf({
      negociacao,
      loja,
      decisao,
      vendedorNome: negociacao.vendedor_user_id === authz.user.id ? authz.user.full_name : null,
    });
  } catch {
    return fail("internal_error", "Erro ao gerar o contrato.", 500, { requestId });
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=contrato-${negociacao.tipo}-${negociacao.numero}${decisao?.versao === "minuta" ? "-minuta" : ""}.pdf`,
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
      ...(decisao
        ? {
            "X-Contrato-Versao": decisao.versao,
            "X-Contrato-Anexos-Pendentes": decisao.anexos_pendentes.join(","),
          }
        : {}),
    },
  });
}
