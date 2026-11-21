/**
 * /api/v1/fiscal/regras — regras fiscais da loja (CFOP, CSOSN/CST, textos).
 * GET lista; PATCH edita uma regra; POST {acao:"revisar"} marca todas como revisadas.
 * O lojista escolhe a operação na tela; o CFOP sai daqui, nunca de um campo livre.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  id: z.string().uuid(),
  cfop: z.string().regex(/^\d{4}$/).optional(),
  natureza_operacao: z.string().trim().min(3).max(60).optional(),
  csosn_ou_cst: z.string().trim().max(4).nullable().optional(),
  aliq_icms: z.number().min(0).max(100).nullable().optional(),
  reducao_bc_pct: z.number().min(0).max(100).nullable().optional(),
  cst_ibscbs: z.string().trim().max(3).nullable().optional(),
  cst_pis: z.string().trim().min(2).max(2).optional(),
  cst_cofins: z.string().trim().min(2).max(2).optional(),
  cclasstrib: z.string().trim().max(6).nullable().optional(),
  texto_inf_adic: z.string().trim().max(2000).nullable().optional(),
  validado_contador: z.boolean().optional(),
  ativo: z.boolean().optional(),
});
const revisarSchema = z.object({ acao: z.literal("revisar") });

export async function GET() {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fiscal" });
  if (!authz.ok) return authz.response;
  const { data, error } = await createAdminClient().from("regras_fiscais").select("*")
    .eq("organization_id", authz.org.orgId).order("operacao").order("destino").order("tipo_pessoa");
  if (error) return fail("internal_error", "Não foi possível ler as regras fiscais.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function PATCH(req: NextRequest) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fiscal" });
  if (!authz.ok) return authz.response;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Regra fiscal inválida.", 422, { requestId });
  const { id, ...campos } = parsed.data;
  const org = authz.org.orgId;
  const admin = createAdminClient();
  const { data, error } = await admin.from("regras_fiscais")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", id).eq("organization_id", org).select("id").maybeSingle();
  if (error) {
    logger.error("[fiscal/regras] update falhou", { error: error.message, requestId });
    return fail("internal_error", "Não foi possível salvar a regra.", 500, { requestId });
  }
  if (!data) return fail("not_found", "Regra não encontrada.", 404, { requestId });
  // Mexer numa regra invalida a revisão anterior.
  await admin.from("config_fiscal_loja").update({ regras_revisadas_em: null }).eq("organization_id", org);
  await audit({ organizationId: org, actorUserId: authz.user.id, action: "fiscal.regra_editada",
    resourceType: "regras_fiscais", resourceId: id, requestId, metadata: { campos: Object.keys(campos) } });
  return ok({ id }, { requestId });
}

export async function POST(req: NextRequest) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fiscal" });
  if (!authz.ok) return authz.response;
  if (!revisarSchema.safeParse(await req.json().catch(() => null)).success)
    return fail("validation_failed", "Ação inválida.", 422, { requestId });
  const org = authz.org.orgId;
  const { data, error } = await createAdminClient().from("config_fiscal_loja")
    .update({ regras_revisadas_em: new Date().toISOString() }).eq("organization_id", org).select("id").maybeSingle();
  if (error) return fail("internal_error", "Não foi possível marcar como revisado.", 500, { requestId });
  if (!data) return fail("conflict", "Salve os dados da empresa antes de revisar as regras.", 409, { requestId });
  await audit({ organizationId: org, actorUserId: authz.user.id, action: "fiscal.regras_revisadas",
    resourceType: "config_fiscal_loja", resourceId: data.id as string, requestId, metadata: {} });
  return ok({ revisado: true }, { requestId });
}
