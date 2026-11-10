"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { escritaDeAdminOuRecusa } from "@/lib/auth/escritaDeAdminOuRecusa";
import { invalidarTravaDoLogo } from "@/lib/branding/logo-bloqueado";
import { invalidarMarcaDaInstalacao } from "@/lib/branding/instalacao";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { createAdminClient } from "@/lib/supabase/admin";

export type DefinirTravaDoLogoResult = { ok: true } | { ok: false; error: string };

/**
 * Liga ou desliga a trava que impede as empresas de trocar o logo.
 * Escrita só do admin mestre (`requirePlatformAdminEscrita`): é ele quem decide
 * se as empresas podem ter logo próprio.
 */
export async function definirTravaDoLogo(bloqueado: boolean): Promise<DefinirTravaDoLogoResult> {
  if (typeof bloqueado !== "boolean") return { ok: false, error: "validation_failed" };
  const escrita = await escritaDeAdminOuRecusa();
  if (!escrita.ok) return escrita;
  const { user } = escrita.ctx;

  const hdrs = await headers();
  const { error } = await createAdminClient()
    .from("platform_branding")
    .upsert({ id: 1, logo_bloqueado: bloqueado, updated_by: user.id }, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };

  invalidarTravaDoLogo();
  invalidarMarcaDaInstalacao();

  await audit({
    action: "platform_branding.updated",
    actorUserId: user.id,
    resourceType: "platform_branding",
    resourceId: null,
    ip: ipDoCliente(hdrs),
    userAgent: hdrs.get("user-agent") ?? null,
    requestId: hdrs.get("x-request-id"),
    actingAsPlatformAdmin: true,
    metadata: { campo: "logo_bloqueado", logo_bloqueado: bloqueado },
  });

  revalidatePath("/admin/marca");
  revalidatePath("/app", "layout");
  return { ok: true };
}
