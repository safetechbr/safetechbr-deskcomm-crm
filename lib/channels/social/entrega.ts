/**
 * Entrega das publicações agendadas ao provedor.
 *
 * O Deskcomm segura a publicação (status `agendada`, sem `provedor_post_id`) e este módulo,
 * chamado a cada minuto pelo cron, decide se já pode entregá-la, aplicando as regras de
 * segurança (`seguranca.ts`). Se não pode, ADIA: grava o motivo e tenta de novo depois.
 * Adiar nunca falha a publicação.
 *
 * ⚠️ DUPLICAR UMA POSTAGEM É PIOR QUE ATRASAR. Por isso:
 *  - a publicação é travada com UPDATE condicional (`agendada` → `publicando`) antes de
 *    falar com o provedor; quem não consegue travar pula;
 *  - uma publicação presa em `publicando` (processo que morreu no meio) NUNCA é reenviada:
 *    vira `falhou` pedindo conferência no provedor, porque pode ter saído.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { idsDeOrgsParadas } from "@/lib/organizacao/operante";
import { socialRequest } from "./client";
import { montarCorpoDeEntrega } from "./publicacoes";
import { FRASE_DO_ADIAMENTO, decidirParaContas, lerSeguranca } from "./seguranca";
import { readSocialIntegration } from "./store";

const DIA_MS = 24 * 60 * 60 * 1000;
const LIMITE_POR_RODADA = 200;
const TENTATIVAS_MAXIMAS = 3;
const PRESA_EM_PUBLICANDO_MS = 10 * 60 * 1000;

export type ResultadoDaEntrega = {
  entregues: number;
  adiadas: number;
  falharam: number;
  interrompidas: number;
  /** Por organização, para o audit só onde houve efeito. */
  porOrganizacao: Map<string, { entregues: number; falharam: number }>;
};

type Linha = {
  id: string;
  organization_id: string;
  tipo: string;
  legenda: string;
  midias: unknown;
  contas: unknown;
  tentativas: number;
  provedor_post_id: string | null;
};

function idsDasContas(contas: unknown): string[] {
  if (!Array.isArray(contas)) return [];
  return contas
    .map((c) => (c && typeof c === "object" ? (c as { id?: unknown }).id : null))
    .filter((id): id is string => typeof id === "string");
}

function mensagemDoErro(e: unknown): string {
  const m = e instanceof Error ? e.message : "Erro desconhecido.";
  return m.slice(0, 300);
}

export async function entregarVencidas(
  db: SupabaseClient,
  agora: number = Date.now(),
): Promise<ResultadoDaEntrega> {
  const r: ResultadoDaEntrega = {
    entregues: 0,
    adiadas: 0,
    falharam: 0,
    interrompidas: 0,
    porOrganizacao: new Map(),
  };
  const conta = (org: string, campo: "entregues" | "falharam") => {
    const x = r.porOrganizacao.get(org) ?? { entregues: 0, falharam: 0 };
    x[campo] += 1;
    r.porOrganizacao.set(org, x);
  };

  // 1) Recuperação: presa em `publicando` pode ter saído. Não reenvia.
  const { data: presas } = await db
    .from("social_publicacoes")
    .update({ status: "falhou", erro: "Envio interrompido. Confira no provedor antes de publicar de novo." })
    .eq("status", "publicando")
    .lt("updated_at", new Date(agora - PRESA_EM_PUBLICANDO_MS).toISOString())
    .select("id");
  r.interrompidas = presas?.length ?? 0;

  // 2) Vencidas que o Deskcomm ainda segura (legado com provedor_post_id fica com o provedor).
  const { data, error } = await db
    .from("social_publicacoes")
    .select("id, organization_id, tipo, legenda, midias, contas, tentativas, provedor_post_id")
    .eq("status", "agendada")
    .is("provedor_post_id", null)
    .lte("agendada_para", new Date(agora).toISOString())
    .order("agendada_para", { ascending: true })
    .limit(LIMITE_POR_RODADA);
  if (error) throw new Error(`consulta das publicações vencidas falhou: ${error.message}`);
  const linhas = (data ?? []) as Linha[];
  if (linhas.length === 0) return r;

  const paradas = new Set(await idsDeOrgsParadas(db));
  const porOrg = new Map<string, Linha[]>();
  for (const l of linhas) {
    if (paradas.has(l.organization_id)) continue; // org suspensa não publica
    porOrg.set(l.organization_id, [...(porOrg.get(l.organization_id) ?? []), l]);
  }

  for (const [org, fila] of porOrg) {
    try {
      await entregarDaOrganizacao(db, org, fila, agora, r, conta);
    } catch (e) {
      logger.error("[social-publicacoes] organização falhou", { organization_id: org, error: mensagemDoErro(e) });
    }
  }
  return r;
}

async function entregarDaOrganizacao(
  db: SupabaseClient,
  org: string,
  fila: Linha[],
  agora: number,
  r: ResultadoDaEntrega,
  conta: (org: string, campo: "entregues" | "falharam") => void,
) {
  const config = await readSocialIntegration(db, org);
  if (!config) return;

  const { data: segRow } = await db.from("social_seguranca").select("*").eq("organization_id", org).maybeSingle();
  const seguranca = lerSeguranca(segRow);

  // Histórico da janela de 24h por conta, para a regra de limite/intervalo/lote.
  const { data: feitas } = await db
    .from("social_publicacoes")
    .select("contas, publicada_em")
    .eq("organization_id", org)
    .eq("status", "publicada")
    .gt("publicada_em", new Date(agora - DIA_MS).toISOString());
  const historico = new Map<string, number[]>();
  for (const f of feitas ?? []) {
    const t = Date.parse(String(f.publicada_em));
    if (!Number.isFinite(t)) continue;
    for (const id of idsDasContas(f.contas)) historico.set(id, [...(historico.get(id) ?? []), t]);
  }

  // Conta que já teve uma publicação adiada nesta rodada fica travada: a seguinte, mais
  // nova, não pode furar a fila e sair antes.
  const travadas = new Set<string>();

  for (const p of fila) {
    const ids = idsDasContas(p.contas);
    if (ids.length === 0) continue;
    if (ids.some((id) => travadas.has(id))) {
      await db
        .from("social_publicacoes")
        .update({ aguardando_motivo: "Aguardando a publicação anterior da fila." })
        .eq("id", p.id)
        .eq("status", "agendada");
      r.adiadas += 1;
      continue;
    }

    const d = decidirParaContas(ids, historico, seguranca, agora);
    if (d.acao === "adiar") {
      for (const id of ids) travadas.add(id);
      await db
        .from("social_publicacoes")
        .update({ aguardando_motivo: FRASE_DO_ADIAMENTO[d.motivo] })
        .eq("id", p.id)
        .eq("status", "agendada");
      r.adiadas += 1;
      continue;
    }

    // Trava atômica: só um processo (ou o usuário cancelando) vence.
    const { data: travada } = await db
      .from("social_publicacoes")
      .update({ status: "publicando", aguardando_motivo: null, updated_at: new Date(agora).toISOString() })
      .eq("id", p.id)
      .eq("organization_id", org)
      .eq("status", "agendada")
      .select("id");
    if (!travada || travada.length === 0) continue;

    try {
      const contas = (p.contas as { id: string; platform: string }[]) ?? [];
      const corpo = montarCorpoDeEntrega(
        { tipo: p.tipo as never, legenda: p.legenda, midias: p.midias as never },
        contas,
      );
      const resposta = (await socialRequest(config.key, "posts", corpo)) as { post?: { _id?: string } } | null;
      const quando = Date.now();
      await db
        .from("social_publicacoes")
        .update({
          status: "publicada",
          publicada_em: new Date(quando).toISOString(),
          provedor_post_id: resposta?.post?._id ?? null,
          erro: null,
        })
        .eq("id", p.id);
      for (const id of ids) historico.set(id, [...(historico.get(id) ?? []), quando]);
      r.entregues += 1;
      conta(org, "entregues");
    } catch (e) {
      const tentativas = p.tentativas + 1;
      const definitiva = tentativas >= TENTATIVAS_MAXIMAS;
      await db
        .from("social_publicacoes")
        .update({
          status: definitiva ? "falhou" : "agendada",
          tentativas,
          erro: mensagemDoErro(e),
        })
        .eq("id", p.id);
      if (definitiva) {
        r.falharam += 1;
        conta(org, "falharam");
      } else {
        for (const id of ids) travadas.add(id);
        r.adiadas += 1;
      }
    }
  }
}
