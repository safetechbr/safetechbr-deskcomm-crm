/** Grava no banco o resultado do provedor (emissão, consulta ou webhook). Só service_role. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResultadoDocumento } from "./provider";

/**
 * `doc` precisa vir de uma leitura já filtrada por organização.
 * Devolve true quando o status mudou (quem chama só audita nesse caso).
 */
export async function aplicarResultado(
  admin: SupabaseClient,
  doc: { id: string; organization_id: string; status: string; rascunho: unknown },
  r: ResultadoDocumento,
): Promise<boolean> {
  const mudou = doc.status !== r.status;
  const patch: Record<string, unknown> = {
    status: r.status,
    retorno_provider: r.bruto ?? null,
    motivo_rejeicao: r.rejeicao ? `${r.rejeicao.codigo ?? ""} ${r.rejeicao.explicacao}`.trim() : null,
    updated_at: new Date().toISOString(),
  };
  if (r.chave) patch.chave = r.chave;
  if (r.protocolo) patch.protocolo = r.protocolo;
  if (r.xmlUrl) patch.xml_url = r.xmlUrl;
  if (r.pdfUrl) patch.pdf_url = r.pdfUrl;
  const { error } = await admin.from("documentos_fiscais").update(patch).eq("id", doc.id).eq("organization_id", doc.organization_id);
  if (error) throw new Error(error.message);
  const teste = (doc.rascunho as { teste?: boolean } | null)?.teste === true;
  if (r.status === "autorizada" && teste) {
    await admin.from("config_fiscal_loja").update({ nota_teste_ok_em: new Date().toISOString() })
      .eq("organization_id", doc.organization_id).is("nota_teste_ok_em", null);
  }
  // Efeito da autorização (veículo + evento nfe.autorizada): idempotente no banco.
  if (r.status === "autorizada") {
    const { error: e2 } = await admin.rpc("fn_nfe_autorizada", { p_doc: doc.id });
    if (e2) throw new Error(e2.message);
  }
  return mudou;
}
