import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { listSocialAccounts, SocialError } from "../client";
import { publicacaoSchema, validarPublicacao, type PublicacaoInput } from "../publicacoes";
import { readSocialIntegration } from "../store";
import { REGRAS_DE_STORY } from "./regras";

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const janelaSchema = z
  .object({
    id: z.uuid().optional(),
    nome: z.string().trim().min(1).max(60),
    inicio: hora,
    fim: hora,
    intervalo_min: z.number().int().min(1).max(240),
    dias_semana: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    ativa: z.boolean().default(true),
  })
  .strict()
  .refine((j) => j.fim > j.inicio, { message: "O fim precisa ser depois do início.", path: ["fim"] });
export type JanelaInput = z.infer<typeof janelaSchema>;

const midia = publicacaoSchema.shape.midias.element;
const legenda = z.string().max(2200).default("");
const contas = z.array(z.string().regex(/^[a-f0-9]{24}$/)).min(1).max(10);
const instante = z.iso.datetime({ offset: true });
const fuso = z.string().min(3).max(64).default("America/Sao_Paulo");

export const storyNovoSchema = z
  .object({
    midia,
    legenda,
    account_ids: contas,
    /** Cada data vira um Story. Uma só = Story avulso; várias = série. */
    datas: z.array(instante).min(1).max(REGRAS_DE_STORY.max_por_serie),
    fuso,
  })
  .strict();
export type StoryNovoInput = z.infer<typeof storyNovoSchema>;

export const storyLoteSchema = z
  .object({
    account_ids: contas,
    itens: z.array(z.object({ midia, legenda, agendada_para: instante }).strict()).min(1).max(50),
    fuso,
  })
  .strict();
export type StoryLoteInput = z.infer<typeof storyLoteSchema>;

export const storyEdicaoSchema = z
  .object({
    id: z.uuid(),
    legenda: z.string().max(2200).optional(),
    midia: midia.optional(),
    agendada_para: instante.optional(),
    /** `series`: propaga mídia, legenda e o deslocamento de horário às demais agendadas da série. */
    escopo: z.enum(["single", "series"]).default("single"),
  })
  .strict();
export type StoryEdicaoInput = z.infer<typeof storyEdicaoSchema>;

type Conta = { id: string; platform: string };

async function resolverContas(db: SupabaseClient, org: string, ids: string[]): Promise<Conta[]> {
  const config = await readSocialIntegration(db, org);
  if (!config) throw new SocialError("Ative as redes sociais primeiro.", 422);
  // Contas vêm do PERFIL da organização, nunca do corpo: id alheio não passa.
  const doPerfil = await listSocialAccounts(config.key, config.profileId);
  const out: Conta[] = [];
  for (const id of new Set(ids)) {
    const c = doPerfil.find((a) => a._id === id && a.isActive);
    if (!c) throw new SocialError("Conta não encontrada neste perfil.", 404);
    out.push({ id: c._id, platform: c.platform });
  }
  return out;
}

function comoPublicacao(m: PublicacaoInput["midias"][number], leg: string, quando: string, f: string, ids: string[]): PublicacaoInput {
  return { tipo: "story", legenda: leg, midias: [m], account_ids: ids, agendada_para: quando, fuso: f };
}

async function inserirStories(
  db: SupabaseClient,
  org: string,
  userId: string,
  cs: Conta[],
  itens: { midia: PublicacaoInput["midias"][number]; legenda: string; quando: string }[],
  f: string,
  serie: string | null,
) {
  const ids = cs.map((c) => c.id);
  for (const it of itens) validarPublicacao(comoPublicacao(it.midia, it.legenda, it.quando, f, ids), cs);
  const { data, error } = await db
    .from("social_publicacoes")
    .insert(
      itens.map((it) => ({
        organization_id: org,
        tipo: "story",
        legenda: it.legenda,
        midias: [it.midia],
        contas: cs,
        agendada_para: it.quando,
        fuso: f,
        status: "agendada",
        criada_por: userId,
        serie_id: serie,
      })),
    )
    .select("id");
  if (error || !data) throw new SocialError("Não foi possível agendar os Stories.", 500);
  return data.map((r) => r.id as string);
}

export async function criarStories(db: SupabaseClient, org: string, userId: string, input: StoryNovoInput) {
  const cs = await resolverContas(db, org, input.account_ids);
  const unicas = [...new Set(input.datas.map((d) => new Date(d).toISOString()))].sort();
  const serie = unicas.length > 1 ? randomUUID() : null;
  const ids = await inserirStories(
    db, org, userId, cs,
    unicas.map((quando) => ({ midia: input.midia, legenda: input.legenda, quando })),
    input.fuso, serie,
  );
  return { ids, serie_id: serie };
}

export async function criarLoteDeStories(db: SupabaseClient, org: string, userId: string, input: StoryLoteInput) {
  const cs = await resolverContas(db, org, input.account_ids);
  const ids = await inserirStories(
    db, org, userId, cs,
    input.itens.map((i) => ({ midia: i.midia, legenda: i.legenda, quando: i.agendada_para })),
    input.fuso, null,
  );
  return { ids };
}

const COLUNAS = "id, tipo, legenda, midias, contas, agendada_para, fuso, status, erro, aguardando_motivo, publicada_em, serie_id";

export async function listarStories(db: SupabaseClient, org: string) {
  const { data, error } = await db
    .from("social_publicacoes")
    .select(COLUNAS)
    .eq("organization_id", org)
    .eq("tipo", "story")
    .order("agendada_para", { ascending: true })
    .limit(1000);
  if (error) throw new SocialError("Não foi possível ler os Stories.", 500);
  return data ?? [];
}

type Linha = { id: string; status: string; agendada_para: string; serie_id: string | null; legenda: string; midias: unknown };

async function lerStory(db: SupabaseClient, org: string, id: string): Promise<Linha> {
  const { data, error } = await db
    .from("social_publicacoes")
    .select("id, status, agendada_para, serie_id, legenda, midias")
    .eq("organization_id", org)
    .eq("tipo", "story")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new SocialError("Não foi possível ler o Story.", 500);
  if (!data) throw new SocialError("Story não encontrado.", 404);
  return data as Linha;
}

/** O "pai" da série é o Story agendado mais cedo: só ele propaga alterações às demais. */
async function irmaosAgendados(db: SupabaseClient, org: string, serie: string): Promise<Linha[]> {
  const { data, error } = await db
    .from("social_publicacoes")
    .select("id, status, agendada_para, serie_id, legenda, midias")
    .eq("organization_id", org)
    .eq("serie_id", serie)
    .eq("status", "agendada")
    .order("agendada_para", { ascending: true });
  if (error) throw new SocialError("Não foi possível ler a série.", 500);
  return (data ?? []) as Linha[];
}

export async function editarStory(db: SupabaseClient, org: string, input: StoryEdicaoInput) {
  const alvo = await lerStory(db, org, input.id);
  if (alvo.status !== "agendada") throw new SocialError("Só dá para editar Stories agendados.", 409);
  if (input.agendada_para && !(Date.parse(input.agendada_para) >= Date.now() + 60_000))
    throw new SocialError("Escolha um horário no futuro.", 422);

  const mudanca = (extra: Record<string, unknown> = {}) => ({
    ...(input.legenda !== undefined ? { legenda: input.legenda } : {}),
    ...(input.midia ? { midias: [input.midia] } : {}),
    ...extra,
  });

  const escopoSerie = input.escopo === "series" && alvo.serie_id;
  let afetados = [alvo];
  if (escopoSerie) {
    const todos = await irmaosAgendados(db, org, alvo.serie_id!);
    if (todos[0]?.id !== alvo.id)
      throw new SocialError("Edite a série pelo primeiro Story agendado dela.", 409);
    afetados = todos;
  }
  const delta = input.agendada_para ? Date.parse(input.agendada_para) - Date.parse(alvo.agendada_para) : 0;
  for (const s of afetados) {
    const quando = delta ? new Date(Date.parse(s.agendada_para) + delta).toISOString() : undefined;
    if (quando && !(Date.parse(quando) >= Date.now() + 60_000))
      throw new SocialError("Algum Story da série ficaria no passado.", 422);
    // Condicional ao estado: se o cron travou o Story no meio, a edição não pega.
    const { error } = await db
      .from("social_publicacoes")
      .update(mudanca(quando ? { agendada_para: quando } : {}))
      .eq("organization_id", org)
      .eq("id", s.id)
      .eq("status", "agendada");
    if (error) throw new SocialError("Não foi possível salvar o Story.", 500);
  }
  return { ids: afetados.map((s) => s.id) };
}

export async function cancelarStory(db: SupabaseClient, org: string, id: string, escopo: "single" | "series") {
  const alvo = await lerStory(db, org, id);
  if (alvo.status !== "agendada") throw new SocialError("Só dá para cancelar Stories agendados.", 409);
  let q = db.from("social_publicacoes").update({ status: "cancelada" }).eq("organization_id", org).eq("status", "agendada");
  q = escopo === "series" && alvo.serie_id ? q.eq("serie_id", alvo.serie_id) : q.eq("id", id);
  const { data, error } = await q.select("id");
  if (error) throw new SocialError("Não foi possível cancelar.", 500);
  if (!data?.length) throw new SocialError("Este Story já está sendo enviado e não dá mais para cancelar.", 409);
  return { ids: data.map((r) => r.id as string) };
}

/** Reenvio de um Story que falhou: volta à fila, para o próximo ciclo do cron. */
export async function reenviarStory(db: SupabaseClient, org: string, id: string) {
  const alvo = await lerStory(db, org, id);
  if (alvo.status !== "falhou") throw new SocialError("Só dá para reenviar Stories que falharam.", 409);
  const { data, error } = await db
    .from("social_publicacoes")
    .update({ status: "agendada", erro: null, tentativas: 0, aguardando_motivo: null, agendada_para: new Date().toISOString() })
    .eq("organization_id", org)
    .eq("id", id)
    .eq("status", "falhou")
    .select("id");
  if (error || !data?.length) throw new SocialError("Não foi possível reenviar o Story.", 500);
  return { id };
}

export async function listarJanelas(db: SupabaseClient, org: string) {
  const { data, error } = await db
    .from("social_story_janelas")
    .select("id, nome, inicio, fim, intervalo_min, dias_semana, ativa, posicao")
    .eq("organization_id", org)
    .order("posicao", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new SocialError("Não foi possível ler as janelas.", 500);
  return data ?? [];
}

export async function salvarJanela(db: SupabaseClient, org: string, input: JanelaInput) {
  const { id, ...campos } = input;
  if (id) {
    const { data, error } = await db
      .from("social_story_janelas")
      .update(campos)
      .eq("organization_id", org)
      .eq("id", id)
      .select("id");
    if (error) throw new SocialError("Não foi possível salvar a janela.", 500);
    if (!data?.length) throw new SocialError("Janela não encontrada.", 404);
    return { id };
  }
  const { count } = await db
    .from("social_story_janelas")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org);
  if ((count ?? 0) >= 20) throw new SocialError("Limite de 20 janelas por conta.", 422);
  const { data, error } = await db
    .from("social_story_janelas")
    .insert({ organization_id: org, ...campos, posicao: count ?? 0 })
    .select("id")
    .single();
  if (error || !data) throw new SocialError("Não foi possível criar a janela.", 500);
  return { id: data.id as string };
}

export async function excluirJanela(db: SupabaseClient, org: string, id: string) {
  const { data, error } = await db
    .from("social_story_janelas")
    .delete()
    .eq("organization_id", org)
    .eq("id", id)
    .select("id");
  if (error) throw new SocialError("Não foi possível excluir a janela.", 500);
  if (!data?.length) throw new SocialError("Janela não encontrada.", 404);
  return { id };
}
