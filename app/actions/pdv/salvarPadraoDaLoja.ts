"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { podeAdministrarEmpresa } from "@/lib/auth/pode-administrar-empresa";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { supportWriteError } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { empresaContratoSchema } from "@/lib/pdv/modelo-contrato";
import { createAdminClient } from "@/lib/supabase/admin";

const texto = z.string().trim().max(300).optional();

const entradaSchema = z.object({
  empresa: empresaContratoSchema.extend({
    razao_social: z.string().trim().min(1).max(200),
    cnpj: z.string().trim().max(20),
  }),
  representante_nome: texto,
  representante_cpf: texto,
  representante_cargo: texto,
});

export type SalvarPadraoDaLojaInput = z.input<typeof entradaSchema>;
export type SalvarPadraoDaLojaResult = { ok: true } | { ok: false; error: string };

/**
 * Grava, como padrão da loja, os dados de "Loja (vendedora)" digitados no PDV.
 * Mesma porta de `updateTenant`: escrita em `organizations` só pelo admin client
 * (a policy de escrita é só de platform admin), com gate de papel e filtro por id.
 * Só mexe na identidade e nos campos de empresa/representante: cláusulas, prazos
 * e demais chaves de `dados_contrato` são preservados.
 */
export async function salvarPadraoDaLoja(
  input: SalvarPadraoDaLojaInput,
): Promise<SalvarPadraoDaLojaResult> {
  const parsed = entradaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation_failed" };

  const authUser = await loadAuthUser();
  if (!authUser) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(authUser.support)) return { ok: false, error: "forbidden" };
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) return { ok: false, error: "forbidden_tenant" };
  if (!podeAdministrarEmpresa(authUser, activeOrg)) return { ok: false, error: "forbidden_role" };
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const supabase = createAdminClient();
  const orgId = activeOrg.orgId;

  const atual = await supabase
    .from("organizations")
    .select("dados_contrato")
    .eq("id", orgId)
    .maybeSingle();
  if (atual.error || !atual.data) {
    logger.error("[salvarPadraoDaLoja] leitura falhou", { orgId, erro: atual.error?.message });
    return { ok: false, error: "not_found" };
  }

  const { empresa, representante_nome, representante_cpf, representante_cargo } = parsed.data;
  const { razao_social, nome_fantasia, cnpj, ...resto } = empresa;
  const dadosContrato = {
    ...((atual.data.dados_contrato as Record<string, unknown> | null) ?? {}),
    ...resto,
    representante_nome: representante_nome ?? "",
    representante_cpf: representante_cpf ?? "",
    representante_cargo: representante_cargo ?? "",
  };

  const { error } = await supabase
    .from("organizations")
    .update({
      legal_name: razao_social,
      display_name: nome_fantasia || razao_social,
      cnpj: cnpj || null,
      dados_contrato: dadosContrato,
    })
    .eq("id", orgId);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Este CNPJ já pertence a outra organização." };
    }
    logger.error("[salvarPadraoDaLoja] gravação falhou", { orgId, erro: error.message });
    return { ok: false, error: "write_failed" };
  }

  const hdrs = await headers();
  const requestId = hdrs.get("x-request-id");
  await audit({
    action: "org.updated",
    actorUserId: authUser.id,
    organizationId: orgId,
    resourceType: "organization",
    resourceId: orgId,
    requestId,
    ip: ipDoCliente(hdrs),
    userAgent: hdrs.get("user-agent") ?? null,
    metadata: { fields_changed: ["legal_name", "display_name", "cnpj", "dados_contrato"], origem: "pdv" },
  });

  const evento = await supabase.rpc("emit_event", {
    p_event_type: "org.updated",
    p_entity_kind: "organization",
    p_entity_id: orgId,
    p_payload: { organization_id: orgId },
    p_metadata: { request_id: requestId },
    p_organization_id: orgId,
  });
  if (evento.error) {
    logger.error("[salvarPadraoDaLoja] emit_event falhou", { erro: evento.error.message });
  }

  revalidatePath("/app/settings/tenant");
  revalidatePath("/pdv");
  return { ok: true };
}
