import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { listSocialAccounts, socialRequest, SocialError } from "./client";
import { readSocialIntegration } from "./store";

export const TIPOS_DE_PUBLICACAO = ["feed", "carrossel", "reel", "story"] as const;
export type TipoDePublicacao = (typeof TIPOS_DE_PUBLICACAO)[number];

/** Só aceita mídia hospedada pelo provedor (volta do presign): nunca URL livre. */
const HOST_DA_MIDIA = "media.zernio.com";
const midiaSchema = z
  .object({
    type: z.enum(["image", "video"]),
    url: z.url().refine((u) => {
      try {
        const x = new URL(u);
        return x.protocol === "https:" && x.hostname === HOST_DA_MIDIA && !x.username;
      } catch {
        return false;
      }
    }, "Mídia fora do armazenamento permitido."),
  })
  .strict();

export const publicacaoSchema = z
  .object({
    tipo: z.enum(TIPOS_DE_PUBLICACAO),
    legenda: z.string().max(2200).default(""),
    midias: z.array(midiaSchema).min(1).max(20),
    account_ids: z.array(z.string().regex(/^[a-f0-9]{24}$/)).min(1).max(10),
    agendada_para: z.iso.datetime({ offset: true }),
    fuso: z.string().min(3).max(64).default("America/Sao_Paulo"),
  })
  .strict();
export type PublicacaoInput = z.infer<typeof publicacaoSchema>;

type Conta = { id: string; platform: string };

/** Regras de mídia por tipo; lança 422 com a mensagem para o usuário. */
export function validarPublicacao(input: PublicacaoInput, contas: Conta[], agora = Date.now()) {
  const { tipo, midias } = input;
  const quando = Date.parse(input.agendada_para);
  if (!(quando >= agora + 60_000))
    throw new SocialError("Escolha um horário no futuro.", 422);
  if (quando > agora + 365 * 86_400_000)
    throw new SocialError("O agendamento pode ser de até um ano.", 422);
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.fuso });
  } catch {
    throw new SocialError("Fuso horário inválido.", 422);
  }
  if (tipo === "feed" && midias.length !== 1)
    throw new SocialError("O post de feed leva uma imagem ou um vídeo.", 422);
  if (tipo === "carrossel" && (midias.length < 2 || midias.length > 20))
    throw new SocialError("O carrossel leva de 2 a 20 itens.", 422);
  if (tipo === "reel" && !(midias.length === 1 && midias[0]!.type === "video"))
    throw new SocialError("O Reels leva exatamente um vídeo.", 422);
  if (tipo === "story" && midias.length !== 1)
    throw new SocialError("O Story leva uma imagem ou um vídeo por vez.", 422);
  if (tipo !== "feed" && contas.some((c) => c.platform !== "instagram"))
    throw new SocialError("Carrossel, Reels e Stories são só para Instagram por enquanto.", 422);
  if (tipo === "feed" && contas.some((c) => c.platform === "instagram") && input.legenda.length > 2200)
    throw new SocialError("A legenda do Instagram vai até 2.200 caracteres.", 422);
}

type Conteudo = { tipo: TipoDePublicacao; legenda: string; midias: PublicacaoInput["midias"] };

function corpoBase(c: Conteudo, contas: Conta[]) {
  const story = c.tipo === "story";
  return {
    content: c.legenda,
    mediaItems: c.midias,
    platforms: contas.map((conta) => ({
      platform: conta.platform,
      accountId: conta.id,
      ...(story
        ? { customMedia: c.midias, platformSpecificData: { contentType: "story" } }
        : {}),
    })),
  };
}

/** Corpo do `POST /v1/posts` agendado no provedor. Pura, para testar sem rede. */
export function montarCorpoDoPost(input: PublicacaoInput, contas: Conta[]) {
  return { ...corpoBase(input, contas), scheduledFor: input.agendada_para, timezone: input.fuso };
}

/**
 * Corpo da ENTREGA: o Deskcomm já decidiu que é a hora (regras de segurança), então o
 * provedor publica na hora. Nunca leva `scheduledFor`: quem agenda é o Deskcomm.
 */
export function montarCorpoDeEntrega(c: Conteudo, contas: Conta[]) {
  return { ...corpoBase(c, contas), publishNow: true };
}

export async function presignarMidia(
  db: SupabaseClient,
  org: string,
  arquivo: { filename: string; contentType: string; size: number },
) {
  const config = await readSocialIntegration(db, org);
  if (!config) throw new SocialError("Ative as redes sociais primeiro.", 422);
  const r = z
    .object({ uploadUrl: z.url(), publicUrl: z.url() })
    .parse(await socialRequest(config.key, "media/presign", arquivo));
  if (new URL(r.publicUrl).hostname !== HOST_DA_MIDIA)
    throw new SocialError("O provedor devolveu um endereço de mídia inesperado.", 502);
  return { upload_url: r.uploadUrl, public_url: r.publicUrl };
}

export async function criarPublicacao(
  db: SupabaseClient,
  org: string,
  userId: string,
  input: PublicacaoInput,
) {
  const config = await readSocialIntegration(db, org);
  if (!config) throw new SocialError("Ative as redes sociais primeiro.", 422);
  // Contas vêm do PERFIL da organização, nunca do corpo: id alheio não passa.
  const doPerfil = await listSocialAccounts(config.key, config.profileId);
  const contas: Conta[] = [];
  for (const id of new Set(input.account_ids)) {
    const conta = doPerfil.find((a) => a._id === id && a.isActive);
    if (!conta) throw new SocialError("Conta não encontrada neste perfil.", 404);
    contas.push({ id: conta._id, platform: conta.platform });
  }
  validarPublicacao(input, contas);
  // A publicação fica AQUI até a hora: o cron de entrega a manda ao provedor quando as
  // regras de segurança (limite diário, intervalo, lote) permitem. Agendar direto no
  // provedor pularia essas regras, e o provedor publica tudo o que recebe, no horário.
  const { data, error } = await db
    .from("social_publicacoes")
    .insert({
      organization_id: org,
      tipo: input.tipo,
      legenda: input.legenda,
      midias: input.midias,
      contas,
      agendada_para: input.agendada_para,
      fuso: input.fuso,
      status: "agendada",
      criada_por: userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new SocialError("Não foi possível agendar a publicação.", 500);
  return { id: data.id as string };
}

export async function listarPublicacoes(db: SupabaseClient, org: string) {
  const { data, error } = await db
    .from("social_publicacoes")
    .select("id, tipo, legenda, midias, contas, agendada_para, fuso, status, erro, aguardando_motivo, publicada_em")
    .eq("organization_id", org)
    // Stories têm tela própria (/app/stories), com kanban, calendário e janelas.
    .neq("tipo", "story")
    .order("agendada_para", { ascending: true, nullsFirst: false })
    .limit(200);
  if (error) throw new SocialError("Não foi possível ler as publicações.", 500);
  return data ?? [];
}

export async function cancelarPublicacao(db: SupabaseClient, org: string, id: string) {
  const { data, error } = await db
    .from("social_publicacoes")
    .select("id, status, provedor_post_id")
    .eq("organization_id", org)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new SocialError("Não foi possível ler a publicação.", 500);
  if (!data) throw new SocialError("Publicação não encontrada.", 404);
  if (data.status !== "agendada")
    throw new SocialError("Só dá para cancelar publicações agendadas.", 409);
  // O estado é conferido na própria escrita: se o cron travou a publicação entre a
  // leitura e agora, o cancelamento não pega e o usuário é avisado em vez de ver "cancelada"
  // uma postagem que saiu.
  const { data: cancelada, error: upd } = await db
    .from("social_publicacoes")
    .update({ status: "cancelada" })
    .eq("organization_id", org)
    .eq("id", id)
    .eq("status", "agendada")
    .select("id");
  if (upd) throw new SocialError("Não foi possível cancelar a publicação.", 500);
  if (!cancelada || cancelada.length === 0)
    throw new SocialError("Esta publicação já está sendo enviada e não dá mais para cancelar.", 409);
  // Legado: publicação agendada direto no provedor antes das regras de segurança.
  const config = await readSocialIntegration(db, org);
  if (config && data.provedor_post_id)
    await socialRequest(config.key, `posts/${data.provedor_post_id}/unpublish`, {});
  return { id };
}
