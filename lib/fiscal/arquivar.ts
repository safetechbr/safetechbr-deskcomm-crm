/**
 * Guarda o XML e o DANFE de uma nota autorizada no bucket privado `fiscal-arquivos`
 * (retenção de 5 anos: a cópia do provedor não é a única). Idempotente: o que já
 * tem caminho gravado não é baixado de novo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import { carregarConfigComContexto } from "./config-servidor";
import { FocusNfeProvider } from "./focus/provider";

export const BUCKET_FISCAL = "fiscal-arquivos";

export type ResultadoArquivamento = { ok: true } | { ok: false; erro: string };

export async function arquivarDocumento(admin: SupabaseClient, orgId: string, docId: string): Promise<ResultadoArquivamento> {
  const { data: doc } = await admin
    .from("documentos_fiscais")
    .select("id, status, ref_provider, xml_storage_path, pdf_storage_path")
    .eq("id", docId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!doc) return { ok: false, erro: "nao_encontrado" };
  // Nota cancelada continua com o XML original disponível (o contador precisa dele).
  if ((doc.status !== "autorizada" && doc.status !== "cancelada") || !doc.ref_provider) return { ok: false, erro: "nao_autorizada" };
  if (doc.xml_storage_path && doc.pdf_storage_path) return { ok: true };

  const c = await carregarConfigComContexto(admin, orgId);
  if (!c?.ctx) return { ok: false, erro: "sem_config" };
  const provider = new FocusNfeProvider();
  const patch: Record<string, string> = {};

  for (const [tipo, coluna, mime] of [
    ["xml", "xml_storage_path", "application/xml"],
    ["pdf", "pdf_storage_path", "application/pdf"],
  ] as const) {
    if (doc[coluna]) continue;
    const bytes = await (tipo === "xml" ? provider.baixarXml(c.ctx, doc.ref_provider) : provider.baixarDanfe(c.ctx, doc.ref_provider)).catch(() => null);
    if (!bytes) continue;
    const caminho = `${orgId}/${docId}.${tipo}`;
    const up = await admin.storage.from(BUCKET_FISCAL).upload(caminho, bytes, { contentType: mime, upsert: true });
    if (up.error) {
      logger.error("[fiscal] upload do arquivo falhou", { orgId, docId, tipo, erro: up.error.message });
      continue;
    }
    patch[coluna] = caminho;
  }

  if (Object.keys(patch).length) {
    const { error } = await admin.from("documentos_fiscais").update(patch).eq("id", docId).eq("organization_id", orgId);
    if (error) return { ok: false, erro: "gravacao_falhou" };
  }
  const xmlOk = Boolean(doc.xml_storage_path || patch.xml_storage_path);
  return xmlOk ? { ok: true } : { ok: false, erro: "xml_indisponivel" };
}

/** Link assinado de curta duração (o bucket é privado). */
export async function linkAssinado(admin: SupabaseClient, caminho: string, segundos: number): Promise<string | null> {
  const { data } = await admin.storage.from(BUCKET_FISCAL).createSignedUrl(caminho, segundos);
  return data?.signedUrl ?? null;
}
