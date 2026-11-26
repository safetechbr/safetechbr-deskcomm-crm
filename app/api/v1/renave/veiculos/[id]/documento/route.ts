/**
 * GET /api/v1/renave/veiculos/:id/documento?tipo= — baixa o documento do RENAVE
 * (só na primeira vez) e devolve URLs assinadas de 5 minutos do bucket privado.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { baixarDocumento, TIPOS_DOC } from "@/lib/renave/servico";
import type { TipoDocumentoRenave } from "@/lib/renave/tipos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const tipoSchema = z.enum(TIPOS_DOC as [TipoDocumentoRenave, ...TipoDocumentoRenave[]]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "renave" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const tipo = tipoSchema.safeParse(req.nextUrl.searchParams.get("tipo"));
  if (!z.string().uuid().safeParse(id).success || !tipo.success)
    return fail("validation_failed", "Veículo ou tipo de documento inválido.", 422, { requestId });
  const org = authz.org.orgId;
  const admin = createAdminClient();
  const r = await baixarDocumento(admin, org, id, tipo.data);
  if ("erro" in r) return fail("upstream_error", r.erro, 502, { requestId });
  const { data: rv } = await admin.from("renave_veiculos").select("documentos")
    .eq("organization_id", org).eq("veiculo_id", id).eq("integradora", "renave_facil").maybeSingle();
  const arquivos = ((rv?.documentos as Record<string, { arquivos?: { path: string; nome: string }[] }> | null)?.[tipo.data]?.arquivos) ?? [];
  if (arquivos.length === 0) return fail("not_found", "Este documento ainda não está disponível no RENAVE.", 404, { requestId });
  const urls: { nome: string; url: string }[] = [];
  for (const a of arquivos) {
    // O caminho começa pela org; conferir de novo é barato e fecha leitura cruzada.
    if (!a.path.startsWith(`${org}/`)) continue;
    const { data } = await admin.storage.from("renave-documentos").createSignedUrl(a.path, 300);
    if (data?.signedUrl) urls.push({ nome: a.nome, url: data.signedUrl });
  }
  return ok({ tipo: tipo.data, arquivos: urls }, { requestId });
}
