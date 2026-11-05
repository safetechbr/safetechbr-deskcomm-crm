/**
 * GET  /api/v1/veiculos — o estoque da organização. `?busca=` (marca/modelo/versão/código),
 *      `?status=disponivel|reservado|vendido` (padrão: todos). Sem paginação: ~100 veículos.
 * POST /api/v1/veiculos — cadastra um veículo (manager+).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  arquivoPertenceAoVeiculo,
  BUCKET_DAS_FOTOS_DE_VEICULO,
  COLUNAS_DO_VEICULO,
  proximoCodigoDeVeiculo,
  STATUS_DO_VEICULO,
  veiculoCreateSchema,
} from "@/lib/veiculos/regras";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "veiculos" });
  if (!authz.ok) return authz.response;

  const params = req.nextUrl.searchParams;
  const supabase = await createClient();
  let q = supabase.from("veiculos").select(COLUNAS_DO_VEICULO).eq("organization_id", authz.org.orgId);

  const status = params.get("status");
  if (status && (STATUS_DO_VEICULO as readonly string[]).includes(status)) q = q.eq("status", status);

  // Termo limpo de vírgula/parêntese/%: entra num filtro `or` do PostgREST.
  const termo = (params.get("busca") ?? "").replace(/[,()%*\\]/g, " ").trim();
  if (termo.length > 0) {
    const t = `%${termo}%`;
    q = q.or(`modelo.ilike.${t},marca.ilike.${t},versao.ilike.${t},codigo.ilike.${t}`);
  }

  const { data, error } = await q.order("status").order("modelo").order("id").limit(500);
  if (error) return fail("internal_error", "Erro ao listar o estoque.", 500, { requestId });
  const lista = (data ?? []) as unknown as Array<{ id: string; fotos: string[] | null }>;
  // `?capas=1`: acrescenta `capa_url` (miniatura assinada da 1ª foto) para o seletor do Inbox.
  if (params.get("capas") === "1") {
    const caminhos = lista
      .map((v) => v.fotos?.[0])
      .filter((c): c is string => !!c && arquivoPertenceAoVeiculo(c, authz.org.orgId, lista.find((v) => v.fotos?.[0] === c)!.id, "foto"));
    const urls: Record<string, string> = {};
    if (caminhos.length > 0) {
      const { data: assinadas } = await createAdminClient()
        .storage.from(BUCKET_DAS_FOTOS_DE_VEICULO)
        .createSignedUrls(caminhos, 3600);
      for (const a of assinadas ?? []) if (a.path && a.signedUrl) urls[a.path] = a.signedUrl;
    }
    return ok(
      lista.map((v) => ({ ...v, capa_url: v.fotos?.[0] ? (urls[v.fotos[0]] ?? null) : null })),
      { requestId },
    );
  }
  return ok(lista, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "veiculos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = veiculoCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  const gerar = !parsed.data.codigo;
  let data: unknown = null;
  let error: { code?: string } | null = null;
  // Código automático: duas pessoas cadastrando ao mesmo tempo podem pegar o
  // mesmo número; o índice único recusa e tentamos de novo com o próximo.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    let codigo = parsed.data.codigo;
    if (gerar) {
      const { data: linhas } = await supabase
        .from("veiculos")
        .select("codigo")
        .eq("organization_id", authz.org.orgId);
      const proximo = proximoCodigoDeVeiculo((linhas ?? []).map((l) => l.codigo as string));
      if (!proximo) return fail("conflict", t("Todos os códigos de 4 dígitos estão em uso."), 409, { requestId });
      codigo = proximo;
    }
    const r = await supabase
      .from("veiculos")
      .insert({ ...parsed.data, codigo, organization_id: authz.org.orgId, created_by: authz.user.id })
      .select(COLUNAS_DO_VEICULO)
      .single();
    data = r.data;
    error = r.error;
    if (!error || error.code !== "23505" || !gerar) break;
  }
  if (error) {
    if (error.code === "23505") return fail("conflict", t("Já existe um veículo com esse código."), 409, { requestId });
    return fail("internal_error", "Erro ao salvar o veículo.", 500, { requestId });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "veiculo.created",
    resourceType: "veiculos",
    resourceId: (data as unknown as { id: string }).id,
    requestId,
  });
  return ok(data, { requestId, status: 201 });
}
