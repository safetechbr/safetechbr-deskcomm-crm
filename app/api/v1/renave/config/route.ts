/**
 * GET/PUT /api/v1/renave/config — configuração da integração RENAVE da loja.
 *
 * A chave de API entra só pelo corpo do PUT, é cifrada (AES-256-GCM) e nunca
 * volta: a leitura usa a view `renave_integracoes_safe` (só os 4 últimos
 * dígitos). PUT sem `api_key` mantém a chave já gravada.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { bufToBytea, encryptKey } from "@/lib/crypto/aes_gcm";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { cnpjValido, soDigitos } from "@/lib/renave/validacao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const COLUNAS_SEGURAS =
  "id, integradora, last4, tem_chave, cnpj, url_plataforma, ativo, limite_creditos_aviso, bloquear_venda_sem_confirmacao, updated_at";

const schema = z.object({
  api_key: z.string().trim().min(10).max(500).optional(),
  cnpj: z.string().transform(soDigitos).refine(cnpjValido, "CNPJ inválido"),
  url_plataforma: z.string().url().max(300).nullable().optional(),
  ativo: z.boolean(),
  limite_creditos_aviso: z.number().int().min(0).max(10_000).default(5),
  bloquear_venda_sem_confirmacao: z.boolean().default(false),
});

export async function GET() {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "renave" });
  if (!authz.ok) return authz.response;
  const { data, error } = await createAdminClient().from("renave_integracoes_safe").select(COLUNAS_SEGURAS)
    .eq("organization_id", authz.org.orgId).eq("integradora", "renave_facil").maybeSingle();
  if (error) return fail("internal_error", "Não foi possível ler a configuração do RENAVE.", 500, { requestId });
  return ok(data ?? null, { requestId });
}

export async function PUT(req: NextRequest) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "renave" });
  if (!authz.ok) return authz.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_failed", parsed.error.issues[0]?.message ?? "Dados inválidos.", 422, { requestId });
  const d = parsed.data;
  const org = authz.org.orgId;
  const admin = createAdminClient();

  const { data: atual } = await admin.from("renave_integracoes_safe").select("tem_chave")
    .eq("organization_id", org).eq("integradora", "renave_facil").maybeSingle();
  if (d.ativo && !d.api_key && !atual?.tem_chave)
    return fail("validation_failed", "Informe a chave de API para ativar a integração.", 422, { requestId });

  const linha: Record<string, unknown> = {
    organization_id: org, integradora: "renave_facil", cnpj: d.cnpj, url_plataforma: d.url_plataforma ?? null,
    ativo: d.ativo, limite_creditos_aviso: d.limite_creditos_aviso,
    bloquear_venda_sem_confirmacao: d.bloquear_venda_sem_confirmacao, updated_at: new Date().toISOString(),
  };
  if (d.api_key) {
    const enc = encryptKey(d.api_key);
    Object.assign(linha, {
      api_key_ciphertext: bufToBytea(enc.ciphertext), api_key_iv: bufToBytea(enc.iv), api_key_tag: bufToBytea(enc.tag),
      api_key_last4: d.api_key.slice(-4),
    });
  }
  const { data: salvo, error } = await admin.from("renave_integracoes")
    .upsert(linha, { onConflict: "organization_id,integradora" }).select("id").single();
  if (error || !salvo) {
    logger.error("[renave/config] salvar falhou", { error: error?.message, requestId });
    return fail("internal_error", "Não foi possível salvar a configuração do RENAVE.", 500, { requestId });
  }
  await audit({ organizationId: org, actorUserId: authz.user.id, action: "renave.config_salva",
    resourceType: "renave_integracoes", resourceId: salvo.id as string, requestId,
    metadata: { ativo: d.ativo, chave_trocada: Boolean(d.api_key), bloquear_venda: d.bloquear_venda_sem_confirmacao } });
  const { data } = await admin.from("renave_integracoes_safe").select(COLUNAS_SEGURAS)
    .eq("organization_id", org).eq("integradora", "renave_facil").maybeSingle();
  return ok(data, { requestId });
}
