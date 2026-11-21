/**
 * GET/PUT /api/v1/fiscal/config — dados fiscais da loja (NF-e 55).
 * Nunca devolve token do provedor nem segredo do webhook. A produção só liga
 * depois da nota de teste autorizada em homologação.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { COLUNAS_CONFIG_PUBLICAS } from "@/lib/fiscal/config-servidor";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const digitos = (n: number) => z.string().transform((s) => s.replace(/\D/g, "")).pipe(z.string().length(n));
const texto = (max: number) => z.string().trim().max(max).nullable().optional();

export const configFiscalSchema = z.object({
  cnpj: digitos(14),
  razao_social: z.string().trim().min(2).max(120),
  nome_fantasia: texto(120),
  inscricao_estadual: texto(20),
  inscricao_municipal: texto(20),
  crt: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  cnae: z.string().transform((s) => s.replace(/\D/g, "")).pipe(z.string().length(7)).nullable().optional(),
  logradouro: texto(120),
  numero: texto(20),
  complemento: texto(60),
  bairro: texto(60),
  municipio: texto(60),
  uf: z.string().trim().length(2).transform((s) => s.toUpperCase()),
  cep: z.string().transform((s) => s.replace(/\D/g, "")).pipe(z.string().length(8)).nullable().optional(),
  telefone: texto(20),
  ambiente: z.enum(["homologacao", "producao"]),
  serie_nfe: z.number().int().min(0).max(999),
  proximo_numero_nfe: z.number().int().min(1),
  email_contador: z.string().trim().email().max(160).nullable().optional(),
  credenciado_sefaz: z.boolean(),
  // Opcionais: quem não os envia não zera a escolha da loja. Nascem desligados.
  entrega_automatica: z.boolean().optional(),
  renave_ativo: z.boolean().optional(),
});

export async function GET() {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fiscal" });
  if (!authz.ok) return authz.response;
  const { data, error } = await createAdminClient()
    .from("config_fiscal_loja").select(COLUNAS_CONFIG_PUBLICAS)
    .eq("organization_id", authz.org.orgId).limit(1).maybeSingle();
  if (error) return fail("internal_error", "Não foi possível ler a configuração fiscal.", 500, { requestId });
  return ok(data, { requestId });
}

export async function PUT(req: NextRequest) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fiscal" });
  if (!authz.ok) return authz.response;
  const parsed = configFiscalSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Dados fiscais inválidos.", 422, { requestId });
  const org = authz.org.orgId;
  const dados = parsed.data;
  const admin = createAdminClient();

  const { data: atual, error: errLeitura } = await admin
    .from("config_fiscal_loja").select("id, crt, nota_teste_ok_em, regras_revisadas_em")
    .eq("organization_id", org).limit(1).maybeSingle();
  if (errLeitura) return fail("internal_error", "Não foi possível ler a configuração fiscal.", 500, { requestId });

  if (dados.ambiente === "producao" && !atual?.nota_teste_ok_em)
    return fail("conflict", "Emita e autorize a nota de teste em homologação antes de ligar a produção.", 409, { requestId });

  const mudouCrt = atual != null && atual.crt !== dados.crt;
  // Trocar o regime muda as regras: a revisão anterior deixa de valer.
  const linha = { ...dados, ...(mudouCrt ? { regras_revisadas_em: null } : {}), updated_at: new Date().toISOString() };

  let id: string;
  if (atual) {
    const { error } = await admin.from("config_fiscal_loja").update(linha).eq("id", atual.id).eq("organization_id", org);
    if (error) {
      logger.error("[fiscal/config] update falhou", { error: error.message, requestId });
      return fail("internal_error", "Não foi possível salvar a configuração fiscal.", 500, { requestId });
    }
    id = atual.id as string;
  } else {
    const { data: criada, error } = await admin.from("config_fiscal_loja")
      .insert({ ...linha, organization_id: org, webhook_segredo: randomBytes(24).toString("hex") })
      .select("id").single();
    if (error || !criada) {
      logger.error("[fiscal/config] insert falhou", { error: error?.message, requestId });
      return fail("internal_error", "Não foi possível salvar a configuração fiscal.", 500, { requestId });
    }
    id = criada.id as string;
  }
  if (!atual || mudouCrt) {
    const { error } = await admin.rpc("fn_semear_regras_fiscais", { p_org: org, p_crt: dados.crt });
    if (error) {
      logger.error("[fiscal/config] semear regras falhou", { error: error.message, requestId });
      return fail("internal_error", "Configuração salva, mas as regras fiscais não foram criadas.", 500, { requestId });
    }
  }
  await audit({ organizationId: org, actorUserId: authz.user.id, action: "fiscal.config_salva",
    resourceType: "config_fiscal_loja", resourceId: id, requestId,
    metadata: { ambiente: dados.ambiente, crt: dados.crt, serie: dados.serie_nfe } });
  return ok({ id }, { requestId });
}
