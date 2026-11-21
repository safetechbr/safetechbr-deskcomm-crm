/**
 * Entrega do DANFE + XML ao comprador após a SAI_VENDA (WhatsApp e/ou e-mail),
 * com links assinados de 7 dias (o bucket é privado).
 *
 * shortcut: sem o ledger de ritmo do WhatsApp (1 mensagem por venda); se a loja
 * passar a disparar em lote, passar pelo ledger.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { emailConfigurado, sendEmail } from "@/lib/email/roteador";
import { logger } from "@/lib/logger";

import { arquivarDocumento, linkAssinado } from "./arquivar";

const SETE_DIAS = 7 * 24 * 3600;

export type ResultadoEntrega =
  | { ok: true; enviados: ("whatsapp" | "email")[] }
  | { ok: false; erro: "nao_encontrado" | "nao_autorizada" | "sem_contato" | "falha_envio" | "ja_enviada" };

export function normalizarTelefone(bruto: string | null | undefined): string | null {
  const d = (bruto ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `+${d}`;
  return null;
}

export async function entregarAoComprador(
  admin: SupabaseClient,
  orgId: string,
  docId: string,
  opts: { forcar: boolean },
): Promise<ResultadoEntrega> {
  const { data: doc } = await admin
    .from("documentos_fiscais")
    .select("id, operacao, status, numero, negociacao_id, rascunho, entrega_enviada_em, xml_storage_path, pdf_storage_path")
    .eq("id", docId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!doc) return { ok: false, erro: "nao_encontrado" };
  if (doc.operacao !== "SAI_VENDA" || doc.status !== "autorizada") return { ok: false, erro: "nao_autorizada" };
  if (doc.entrega_enviada_em && !opts.forcar) return { ok: false, erro: "ja_enviada" };

  let xmlPath = doc.xml_storage_path as string | null;
  let pdfPath = doc.pdf_storage_path as string | null;
  if (!xmlPath || !pdfPath) {
    await arquivarDocumento(admin, orgId, docId);
    const { data: de_novo } = await admin.from("documentos_fiscais").select("xml_storage_path, pdf_storage_path").eq("id", docId).eq("organization_id", orgId).maybeSingle();
    xmlPath = (de_novo?.xml_storage_path as string | null) ?? null;
    pdfPath = (de_novo?.pdf_storage_path as string | null) ?? null;
  }
  const [xmlUrl, pdfUrl] = await Promise.all([
    xmlPath ? linkAssinado(admin, xmlPath, SETE_DIAS) : null,
    pdfPath ? linkAssinado(admin, pdfPath, SETE_DIAS) : null,
  ]);
  if (!xmlUrl && !pdfUrl) return { ok: false, erro: "falha_envio" };

  let cliente: { nome?: string; telefone?: string; email?: string } = {};
  if (doc.negociacao_id) {
    const { data: n } = await admin.from("negociacoes_de_veiculo").select("cliente").eq("id", doc.negociacao_id).eq("organization_id", orgId).maybeSingle();
    cliente = (n?.cliente as typeof cliente | null) ?? {};
  }
  const pessoa = ((doc.rascunho as { pessoa?: { email?: string | null; nome?: string } } | null)?.pessoa) ?? {};
  const email = (pessoa.email || cliente.email || "").trim() || null;
  const telefone = normalizarTelefone(cliente.telefone);
  if (!email && !telefone) return { ok: false, erro: "sem_contato" };

  const nome = (pessoa.nome || cliente.nome || "cliente").split(" ")[0];
  const linhas = [pdfUrl && `DANFE: ${pdfUrl}`, xmlUrl && `XML: ${xmlUrl}`].filter(Boolean) as string[];
  const texto = `Olá, ${nome}! Segue a nota fiscal da sua compra (NF-e ${doc.numero ?? ""}).\n${linhas.join("\n")}\nOs links valem por 7 dias.`;
  const enviados: ("whatsapp" | "email")[] = [];

  if (telefone) {
    try {
      const { getAdapter, resolveSessionRef, CHANNEL_SESSION_REF_COLUMNS } = await import("@/lib/channels");
      const { data: canal } = await admin
        .from("channel_sessions")
        .select(CHANNEL_SESSION_REF_COLUMNS)
        .eq("organization_id", orgId)
        .eq("status", "WORKING")
        .limit(1)
        .maybeSingle();
      if (canal) {
        const linha = canal as unknown as Parameters<typeof resolveSessionRef>[0];
        const adapter = getAdapter(linha.provider as never);
        const to = adapter.resolveRecipient({ isGroup: false, groupChatId: null, phoneNumber: telefone, waIdentity: null, waLid: null });
        if (to && (await adapter.isConfigured())) {
          await adapter.send({ organizationId: orgId, sessionRef: resolveSessionRef(linha), to, kind: "text", body: texto });
          enviados.push("whatsapp");
        }
      }
    } catch (e) {
      logger.error("[fiscal] entrega por WhatsApp falhou", { orgId, docId, erro: e instanceof Error ? e.message : "erro" });
    }
  }

  if (email && (await emailConfigurado())) {
    const html = `<p>Olá, ${nome}!</p><p>Segue a nota fiscal da sua compra (NF-e ${doc.numero ?? ""}).</p><ul>${pdfUrl ? `<li><a href="${pdfUrl}">DANFE (PDF)</a></li>` : ""}${xmlUrl ? `<li><a href="${xmlUrl}">XML</a></li>` : ""}</ul><p>Os links valem por 7 dias.</p>`;
    const r = await sendEmail({ to: email, subject: `Nota fiscal da sua compra${doc.numero ? ` (NF-e ${doc.numero})` : ""}`, html, text: texto });
    if (r.ok) enviados.push("email");
    else logger.error("[fiscal] entrega por e-mail falhou", { orgId, docId, erro: r.error });
  }

  if (!enviados.length) return { ok: false, erro: "falha_envio" };
  await admin.from("documentos_fiscais").update({ entrega_enviada_em: new Date().toISOString() }).eq("id", docId).eq("organization_id", orgId);
  return { ok: true, enviados };
}
