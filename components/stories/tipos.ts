import type { StatusDoStory } from "@/lib/channels/social/stories/janelas";

export type Conta = { id: string; platform: string; name: string };
export type Midia = { type: "image" | "video"; url: string };
export type StoryItem = {
  id: string;
  legenda: string;
  midias: Midia[];
  contas: { id: string; platform: string }[];
  agendada_para: string;
  status: StatusDoStory;
  erro: string | null;
  aguardando_motivo: string | null;
  serie_id: string | null;
};
export type Janela = {
  id: string;
  nome: string;
  inicio: string;
  fim: string;
  intervalo_min: number;
  dias_semana: number[];
  ativa: boolean;
};
export type EstadoDosStories = {
  configured: boolean;
  accounts: Conta[];
  items: StoryItem[];
  janelas: Janela[];
};

export const API = "/api/v1/channels/social/stories";
export const CHAVE = ["social-stories"];

export const NOME_DO_STATUS: Record<StatusDoStory, string> = {
  agendada: "Agendado",
  publicando: "Publicando",
  publicada: "Publicado",
  falhou: "Falhou",
  cancelada: "Cancelado",
};
export const VARIANTE_DO_STATUS: Record<StatusDoStory, "info" | "warning" | "success" | "error" | "neutral"> = {
  agendada: "info",
  publicando: "warning",
  publicada: "success",
  falhou: "error",
  cancelada: "neutral",
};
export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const DIAS_LONGOS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function fusoLocal() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
}
export function horaDe(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
/** `YYYY-MM-DDTHH:mm` (valor do input datetime-local) em hora local. */
export function paraInputLocal(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function inicioDaSemana(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
}
export function somarDias(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
}
