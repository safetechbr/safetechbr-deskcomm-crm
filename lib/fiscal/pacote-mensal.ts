/**
 * Pacote mensal do contador: ZIP com os XMLs das notas autorizadas do mês (inclusive as canceladas depois, com o XML do evento de cancelamento) + CSV
 * com a margem por chassi (venda − custo). Guardado no bucket privado e enviado
 * por e-mail (link assinado de 7 dias) ao `email_contador` da loja.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { strToU8, zipSync } from "fflate";

import { neutralizarFormula } from "@/lib/csv/neutralizar-formula";
import { emailConfigurado, sendEmail } from "@/lib/email/roteador";
import { logger } from "@/lib/logger";

import { carregarConfigComContexto } from "./config-servidor";
import { arquivarDocumento, BUCKET_FISCAL, linkAssinado } from "./arquivar";
import { FocusNfeProvider } from "./focus/provider";
import type { ContextoProvider } from "./provider";

const SETE_DIAS = 7 * 24 * 3600;
// shortcut: um pacote só cabe em memória, ~2000 notas/mês por loja; passar disso, gerar em partes.
const LIMITE_NOTAS = 2000;

export type ResultadoPacote =
  | { ok: true; qtdNotas: number; enviadoPara: string | null }
  | { ok: false; erro: "competencia_invalida" | "sem_config" | "sem_notas" | "falha_gravacao" | "email_nao_configurado" };

const reais = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));
const celula = (v: string) => `"${neutralizarFormula(v).replace(/"/g, '""')}"`;

/** XML do evento de cancelamento: usa a cópia guardada; senão baixa do provedor e guarda. */
async function xmlCancelamento(admin: SupabaseClient, orgId: string, docId: string, ref: string | null, ctx: ContextoProvider | null | undefined): Promise<Uint8Array | null> {
  const caminho = `${orgId}/${docId}-cancelamento.xml`;
  const { data: blob } = await admin.storage.from(BUCKET_FISCAL).download(caminho);
  if (blob) return new Uint8Array(await blob.arrayBuffer());
  if (!ref || !ctx) return null;
  const bytes = await new FocusNfeProvider().baixarXmlCancelamento(ctx, ref).catch(() => null);
  if (!bytes) return null;
  const up = await admin.storage.from(BUCKET_FISCAL).upload(caminho, bytes, { contentType: "application/xml", upsert: true });
  if (up.error) logger.error("[fiscal] upload do XML de cancelamento falhou", { orgId, docId, erro: up.error.message });
  return bytes;
}

/** `competencia` = "YYYY-MM". */
export async function gerarPacoteMensal(admin: SupabaseClient, orgId: string, competencia: string, opts: { enviar: boolean }): Promise<ResultadoPacote> {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(competencia);
  if (!m) return { ok: false, erro: "competencia_invalida" };
  const ini = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const fim = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));

  const { data: cfg } = await admin.from("config_fiscal_loja").select("email_contador, razao_social").eq("organization_id", orgId).maybeSingle();
  if (!cfg) return { ok: false, erro: "sem_config" };

  const colunas = "id, operacao, numero, chave, status, ref_provider, valor_total_cents, autorizada_em, veiculo_id, xml_storage_path";
  const { data: doMes } = await admin.from("documentos_fiscais").select(colunas)
    .eq("organization_id", orgId).in("status", ["autorizada", "cancelada"])
    .gte("autorizada_em", ini.toISOString()).lt("autorizada_em", fim.toISOString())
    .order("autorizada_em").limit(LIMITE_NOTAS);
  // Nota autorizada num mês e cancelada no seguinte: o evento pertence ao mês do cancelamento.
  const { data: evs } = await admin.from("documento_fiscal_eventos").select("documento_id")
    .eq("organization_id", orgId).eq("tipo", "cancelamento").eq("status", "aceito")
    .gte("data", ini.toISOString()).lt("data", fim.toISOString()).limit(LIMITE_NOTAS);
  const jaNoMes = new Set((doMes ?? []).map((d) => d.id));
  const extras = [...new Set((evs ?? []).map((e) => e.documento_id as string | null).filter((i): i is string => !!i && !jaNoMes.has(i)))];
  const { data: deOutroMes } = extras.length
    ? await admin.from("documentos_fiscais").select(colunas).eq("organization_id", orgId).eq("status", "cancelada").in("id", extras)
    : { data: [] as NonNullable<typeof doMes> };
  const docs = [...(doMes ?? []), ...(deOutroMes ?? [])];
  if (!docs.length) return { ok: false, erro: "sem_notas" };

  const ids = [...new Set(docs.map((d) => d.veiculo_id).filter(Boolean))] as string[];
  const { data: veic } = ids.length
    ? await admin.from("veiculos").select("id, chassi, custo_cents").eq("organization_id", orgId).in("id", ids)
    : { data: [] as { id: string; chassi: string | null; custo_cents: number | null }[] };
  const porVeiculo = new Map((veic ?? []).map((v) => [v.id, v]));

  const arquivos: Record<string, Uint8Array> = {};
  const linhas = ["numero;operacao;situacao;chassi;chave;valor_nota;custo;margem"];
  const ctx = docs.some((d) => d.status === "cancelada") ? (await carregarConfigComContexto(admin, orgId))?.ctx : null;
  for (const d of docs) {
    let caminho = d.xml_storage_path as string | null;
    if (!caminho) {
      const r = await arquivarDocumento(admin, orgId, d.id);
      if (r.ok) caminho = `${orgId}/${d.id}.xml`;
    }
    if (caminho) {
      const { data: blob } = await admin.storage.from(BUCKET_FISCAL).download(caminho);
      if (blob) arquivos[`xml/${d.chave ?? d.id}.xml`] = new Uint8Array(await blob.arrayBuffer());
    }
    const cancelada = d.status === "cancelada";
    if (cancelada) {
      const evento = await xmlCancelamento(admin, orgId, d.id, d.ref_provider as string | null, ctx);
      if (evento) arquivos[`xml/eventos/cancelamento-${d.chave ?? d.id}.xml`] = evento;
    }
    const v = d.veiculo_id ? porVeiculo.get(d.veiculo_id) : undefined;
    const venda = d.operacao === "SAI_VENDA" && !cancelada;
    const margem = venda && v?.custo_cents != null && d.valor_total_cents != null ? d.valor_total_cents - v.custo_cents : null;
    linhas.push([d.numero ?? "", d.operacao, cancelada ? "cancelada" : "autorizada", celula(v?.chassi ?? ""), d.chave ?? "", reais(d.valor_total_cents), venda ? reais(v?.custo_cents ?? null) : "", reais(margem)].join(";"));
  }
  arquivos["margem-por-chassi.csv"] = strToU8(`﻿${linhas.join("\r\n")}\r\n`);
  const zip = zipSync(arquivos);

  const caminhoZip = `${orgId}/pacotes/${competencia}.zip`;
  const up = await admin.storage.from(BUCKET_FISCAL).upload(caminhoZip, zip, { contentType: "application/zip", upsert: true });
  if (up.error) {
    logger.error("[fiscal] upload do pacote falhou", { orgId, competencia, erro: up.error.message });
    return { ok: false, erro: "falha_gravacao" };
  }

  let enviadoPara: string | null = null;
  const destino = typeof cfg.email_contador === "string" ? cfg.email_contador.trim() : "";
  if (opts.enviar && destino) {
    if (!(await emailConfigurado())) return { ok: false, erro: "email_nao_configurado" };
    const link = await linkAssinado(admin, caminhoZip, SETE_DIAS);
    if (link) {
      const r = await sendEmail({
        to: destino,
        subject: `Notas fiscais de ${m[2]}/${m[1]} — ${cfg.razao_social ?? "loja"}`,
        text: `Segue o pacote do mês ${m[2]}/${m[1]} (XMLs + margem por chassi). Link válido por 7 dias:\n${link}`,
        html: `<p>Segue o pacote do mês ${m[2]}/${m[1]} (XMLs + margem por chassi).</p><p><a href="${link}">Baixar o pacote</a> (link válido por 7 dias)</p>`,
      });
      if (r.ok) enviadoPara = destino;
      else logger.error("[fiscal] e-mail do pacote falhou", { orgId, competencia, erro: r.error });
    }
  }

  const { error } = await admin.from("fiscal_pacotes_mensais").upsert({
    organization_id: orgId, competencia: `${competencia}-01`, storage_path: caminhoZip, qtd_notas: docs.length,
    enviado_para: enviadoPara, enviado_em: enviadoPara ? new Date().toISOString() : null,
  }, { onConflict: "organization_id,competencia" });
  if (error) {
    logger.error("[fiscal] registro do pacote falhou", { orgId, competencia, erro: error.message });
    return { ok: false, erro: "falha_gravacao" };
  }
  return { ok: true, qtdNotas: docs.length, enviadoPara };
}
