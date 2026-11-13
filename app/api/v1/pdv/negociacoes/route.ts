/**
 * GET  /api/v1/pdv/negociacoes — as negociações do PDV (mais recentes primeiro).
 *      `?tipo=venda|compra`, `?status=rascunho|concluida|cancelada`.
 * POST /api/v1/pdv/negociacoes — abre uma negociação em rascunho (agent+).
 *      Fechar é outra rota (`/[id]/concluir`), porque mexe no estoque.
 */
import { novoContrato } from "@/lib/pdv/modelo-contrato";
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import {
  COLUNAS_DA_NEGOCIACAO,
  negociacaoSchema,
  STATUS_DA_NEGOCIACAO,
  TIPOS_DE_NEGOCIACAO,
} from "@/lib/pdv/regras";
import { vendedorEhDaOrganizacao } from "@/lib/pdv/vendedores";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "negociacoes_de_veiculo" });
  if (!authz.ok) return authz.response;

  const params = req.nextUrl.searchParams;
  const supabase = await createClient();
  let q = supabase
    .from("negociacoes_de_veiculo")
    .select(COLUNAS_DA_NEGOCIACAO)
    .eq("organization_id", authz.org.orgId);
  const tipo = params.get("tipo");
  if (tipo && (TIPOS_DE_NEGOCIACAO as readonly string[]).includes(tipo)) q = q.eq("tipo", tipo);
  const status = params.get("status");
  if (status && (STATUS_DA_NEGOCIACAO as readonly string[]).includes(status))
    q = q.eq("status", status);

  const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error) return fail("internal_error", "Erro ao listar as negociações.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "negociacoes_de_veiculo" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = negociacaoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const entrada = parsed.data;

  if (
    entrada.vendedor_user_id &&
    !(await vendedorEhDaOrganizacao(authz.org.orgId, entrada.vendedor_user_id))
  ) {
    return fail("validation_failed", t("Vendedor não encontrado na organização."), 422, {
      requestId,
    });
  }

  const supabase = await createClient();
  const empresa = await supabase
    .from("organizations")
    .select("legal_name, display_name, cnpj, dados_contrato")
    .eq("id", authz.org.orgId)
    .single();
  if (empresa.error)
    return fail("internal_error", "Não consegui carregar os dados contratuais da empresa.", 500, {
      requestId,
    });
  const padrao = { ...novoContrato(empresa.data), atendido_por: authz.user.full_name ?? "" };
  entrada.contrato = {
    ...padrao,
    ...entrada.contrato,
    empresa: entrada.contrato?.empresa ?? padrao.empresa,
  };
  if (entrada.tipo === "venda" && entrada.veiculo_id) {
    const { data: carro } = await supabase
      .from("veiculos")
      .select("id, status")
      .eq("organization_id", authz.org.orgId)
      .eq("id", entrada.veiculo_id)
      .maybeSingle();
    if (!carro)
      return fail("not_found", t("Veículo não encontrado no estoque."), 404, { requestId });
    if (carro.status === "vendido")
      return fail("conflict", t("Esse veículo já foi vendido."), 409, { requestId });
  }
  if (entrada.tipo === "compra") entrada.veiculo_id = null;
  if (entrada.tipo === "compra") entrada.troca = null;

  let data: unknown = null;
  let error: { code?: string } | null = null;
  // Número sequencial por organização; dois vendedores ao mesmo tempo podem
  // pegar o mesmo — o índice único recusa e tentamos o próximo.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { data: ultima } = await supabase
      .from("negociacoes_de_veiculo")
      .select("numero")
      .eq("organization_id", authz.org.orgId)
      .order("numero", { ascending: false })
      .limit(1)
      .maybeSingle();
    const numero = ((ultima as { numero?: number } | null)?.numero ?? 0) + 1;
    const r = await supabase
      .from("negociacoes_de_veiculo")
      .insert({
        ...entrada,
        numero,
        organization_id: authz.org.orgId,
        vendedor_user_id: entrada.vendedor_user_id ?? authz.user.id,
        created_by: authz.user.id,
      })
      .select(COLUNAS_DA_NEGOCIACAO)
      .single();
    data = r.data;
    error = r.error;
    if (!error || error.code !== "23505") break;
  }
  if (error) return fail("internal_error", "Erro ao salvar a negociação.", 500, { requestId });

  const criada = data as { id: string; tipo: string; numero: number };
  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "negociacao_veiculo.created",
    resourceType: "negociacoes_de_veiculo",
    resourceId: criada.id,
    requestId,
    metadata: { tipo: criada.tipo, numero: criada.numero },
  });
  return ok(data, { requestId, status: 201 });
}
