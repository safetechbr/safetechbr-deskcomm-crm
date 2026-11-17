/**
 * POST /api/v1/pdv/negociacoes/:id/concluir — fecha a negociação (agent+).
 *
 * Confere as pendências aqui (cliente, documento, veículo, pagamentos fechando
 * o total) e delega a mudança de estoque a `fn_concluir_negociacao_de_veiculo`,
 * que trava o veículo e faz tudo numa transação: na venda o carro vira
 * `vendido` e a troca entra no estoque; na compra o carro entra no estoque.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { COLUNAS_DA_NEGOCIACAO, type Negociacao, pendenciasParaConcluir } from "@/lib/pdv/regras";
import { faltandoParaConcluir } from "@/lib/pdv/retrato-da-operacao";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "negociacoes_de_veiculo" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("negociacoes_de_veiculo")
    .select(COLUNAS_DA_NEGOCIACAO)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return fail("not_found", t("Negociação não encontrada."), 404, { requestId });
  const n = data as unknown as Negociacao;
  if (n.status !== "rascunho")
    return fail("conflict", t("Essa negociação já foi fechada."), 409, { requestId });

  // Na venda, o contrato é a tela final: sem os dados obrigatórios dele a
  // negociação não fecha. `faltando` diz o setor e o campo de cada falta;
  // `pendencias` segue com as mensagens soltas para quem já lê esse formato.
  const faltando = faltandoParaConcluir(n, pendenciasParaConcluir(n)).map((f) => ({
    ...f,
    setor: t(f.setor),
    mensagem: t(f.mensagem),
  }));
  if (faltando.length > 0) {
    return fail("validation_failed", faltando[0]!.mensagem, 422, {
      requestId,
      details: { pendencias: faltando.map((f) => f.mensagem), faltando },
    });
  }

  const { error } = await supabase.rpc("fn_concluir_negociacao_de_veiculo", { p_id: id });
  if (error) {
    if (error.message.includes("veiculo_indisponivel")) {
      return fail("conflict", t("Esse veículo já foi vendido."), 409, { requestId });
    }
    if (error.message.includes("negociacao_ja_fechada")) {
      return fail("conflict", t("Essa negociação já foi fechada."), 409, { requestId });
    }
    if (error.code === "42501") return fail("forbidden", t("Sem permissão."), 403, { requestId });
    if (error.code === "23505") {
      return fail(
        "conflict",
        t("Outro veículo entrou no estoque ao mesmo tempo. Tente de novo."),
        409,
        { requestId },
      );
    }
    return fail("internal_error", "Erro ao concluir a negociação.", 500, { requestId });
  }

  const { data: fechada } = await supabase
    .from("negociacoes_de_veiculo")
    .select(COLUNAS_DA_NEGOCIACAO)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "negociacao_veiculo.concluded",
    resourceType: "negociacoes_de_veiculo",
    resourceId: id,
    requestId,
    metadata: { tipo: n.tipo, numero: n.numero, valor_cents: n.valor_cents },
  });
  return ok(fechada, { requestId });
}
