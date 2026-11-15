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
import { renderContratoPdf, type LojaDoContrato } from "@/lib/pdv/contrato";
import { COLUNAS_DA_NEGOCIACAO, type Negociacao } from "@/lib/pdv/regras";
import { decidirVersaoDoContrato } from "@/lib/pdv/versao-do-contrato";
import { marcaDaOrganizacaoParaPdf } from "@/lib/propostas/marca-da-organizacao-para-pdf";
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

  let loja: LojaDoContrato;
  if (negociacao.contrato?.empresa) {
    const e = negociacao.contrato.empresa;
    loja = {
      razaoSocial: e.razao_social,
      nomeFantasia: e.nome_fantasia,
      cnpj: e.cnpj,
      cidade: e.cidade,
      logoUrl: null,
    };
  } else {
    // Histórico sem fotografia contratual: preservar o gerador anterior.
    const [{ data: org }, marca] = await Promise.all([
      supabase
        .from("organizations")
        .select("legal_name, display_name, cnpj")
        .eq("id", authz.org.orgId)
        .maybeSingle(),
      marcaDaOrganizacaoParaPdf(supabase, authz.org.orgId),
    ]);
    const o = (org ?? {}) as { legal_name?: string; display_name?: string; cnpj?: string | null };
    loja = {
      razaoSocial: [o.legal_name, o.display_name].find(Boolean) ?? "Loja",
      nomeFantasia: [marca.appName, o.display_name, o.legal_name].find(Boolean) ?? "Loja",
      cnpj: o.cnpj ?? null,
      logoUrl: marca.logoUrl,
      cidade: null,
    };
  }

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
