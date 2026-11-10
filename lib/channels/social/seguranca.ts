/**
 * Regras de segurança das publicações nas redes sociais.
 *
 * O provedor (Zernio) publica no horário que recebe e não aplica pacing nenhum.
 * Quem protege a conta é o Deskcomm: ele segura a publicação e só a entrega quando
 * estas regras permitem. Vêm do PostPlan: limite por dia, intervalo com variação
 * aleatória entre uma publicação e a seguinte e pausa maior a cada lote.
 *
 * ⚠️ TUDO AQUI É PURO. A decisão não lê relógio nem sorteia: `agora` entra por
 * parâmetro e a variação do intervalo é derivada da última publicação. Assim a
 * mesma pergunta, feita a cada minuto pelo cron, dá sempre a mesma resposta — com
 * `Math.random()` o horário liberado mudaria a cada rodada e a publicação poderia
 * nunca chegar a ser liberada.
 */
import { z } from "zod";

/** O teto REAL da Meta é 100 por conta em janela móvel de 24h. Passar dele trava a conta. */
export const TETO_DA_META_POR_DIA = 100;
const DIA_MS = 24 * 60 * 60 * 1000;

export const segurancaSchema = z
  .object({
    limite_diario: z.number().int().min(1).max(TETO_DA_META_POR_DIA),
    intervalo_min_s: z.number().int().min(10).max(3600),
    intervalo_max_s: z.number().int().min(10).max(3600),
    lote: z.number().int().min(1).max(50),
    pausa_lote_s: z.number().int().min(30).max(7200),
  })
  .strict()
  .refine((c) => c.intervalo_max_s >= c.intervalo_min_s, {
    message: "O intervalo máximo não pode ser menor que o mínimo.",
    path: ["intervalo_max_s"],
  })
  .refine((c) => c.pausa_lote_s >= c.intervalo_max_s, {
    message: "A pausa do lote não pode ser menor que o intervalo máximo.",
    path: ["pausa_lote_s"],
  });
export type Seguranca = z.infer<typeof segurancaSchema>;

export const PRESETS_DE_SEGURANCA = {
  conservador: { limite_diario: 10, intervalo_min_s: 60, intervalo_max_s: 180, lote: 3, pausa_lote_s: 600 },
  padrao: { limite_diario: 20, intervalo_min_s: 30, intervalo_max_s: 120, lote: 5, pausa_lote_s: 300 },
  agressivo: { limite_diario: 50, intervalo_min_s: 15, intervalo_max_s: 60, lote: 10, pausa_lote_s: 120 },
} as const satisfies Record<string, Seguranca>;
export type NomeDoPreset = keyof typeof PRESETS_DE_SEGURANCA;
export const SEGURANCA_PADRAO: Seguranca = PRESETS_DE_SEGURANCA.padrao;

/** Qual preset a configuração é, ou `personalizado` se nenhum bater. */
export function presetDe(c: Seguranca): NomeDoPreset | "personalizado" {
  for (const [nome, p] of Object.entries(PRESETS_DE_SEGURANCA)) {
    if (
      p.limite_diario === c.limite_diario &&
      p.intervalo_min_s === c.intervalo_min_s &&
      p.intervalo_max_s === c.intervalo_max_s &&
      p.lote === c.lote &&
      p.pausa_lote_s === c.pausa_lote_s
    )
      return nome as NomeDoPreset;
  }
  return "personalizado";
}

/** Linha do banco (ou nada) → configuração válida. Valor corrompido cai no padrão, nunca em "sem limite". */
export function lerSeguranca(linha: unknown): Seguranca {
  const parsed = segurancaSchema.safeParse(linha);
  return parsed.success ? parsed.data : SEGURANCA_PADRAO;
}

export type MotivoDoAdiamento = "limite_diario" | "intervalo" | "pausa_de_lote";
export type Decisao =
  | { acao: "publicar" }
  | { acao: "adiar"; ate: number; motivo: MotivoDoAdiamento };

/** Variação do intervalo, repetível: mesma publicação anterior → mesmo intervalo. */
export function intervaloComVariacao(c: Seguranca, semente: number): number {
  const faixa = c.intervalo_max_s - c.intervalo_min_s + 1;
  // Mistura simples de inteiros (Knuth): suficiente para espalhar, não é criptografia.
  const mix = Math.abs(Math.imul(Math.floor(semente / 1000) | 0, 2654435761)) >>> 0;
  return c.intervalo_min_s + (mix % faixa);
}

/**
 * Pode esta conta publicar agora?
 *
 * `publicadas` são os instantes (ms) das publicações bem-sucedidas da conta; não
 * precisa filtrar a janela nem ordenar. Devolve `publicar` ou até quando esperar e por quê.
 */
export function decidirPublicacao(publicadas: number[], c: Seguranca, agora: number): Decisao {
  const janela = publicadas.filter((t) => t > agora - DIA_MS).sort((a, b) => a - b);

  if (janela.length >= c.limite_diario) {
    // O limite volta a ter folga quando a publicação mais antiga dentro da conta sai da janela.
    const ate = janela[janela.length - c.limite_diario]! + DIA_MS;
    return { acao: "adiar", ate, motivo: "limite_diario" };
  }
  if (janela.length === 0) return { acao: "publicar" };

  const ultima = janela[janela.length - 1]!;
  // Tamanho do lote em curso: quantas publicações seguidas sem uma pausa grande no meio.
  let noLote = 1;
  for (let i = janela.length - 1; i > 0; i--) {
    if (janela[i]! - janela[i - 1]! >= c.pausa_lote_s * 1000) break;
    noLote += 1;
  }
  if (noLote >= c.lote) {
    const ate = ultima + c.pausa_lote_s * 1000;
    return agora >= ate ? { acao: "publicar" } : { acao: "adiar", ate, motivo: "pausa_de_lote" };
  }
  const ate = ultima + intervaloComVariacao(c, ultima) * 1000;
  return agora >= ate ? { acao: "publicar" } : { acao: "adiar", ate, motivo: "intervalo" };
}

/** Decide para uma publicação que vai a várias contas: precisa estar liberada em TODAS. */
export function decidirParaContas(
  contasDaPublicacao: string[],
  publicadasPorConta: Map<string, number[]>,
  c: Seguranca,
  agora: number,
): Decisao {
  let pior: Decisao = { acao: "publicar" };
  for (const id of contasDaPublicacao) {
    const d = decidirPublicacao(publicadasPorConta.get(id) ?? [], c, agora);
    if (d.acao === "adiar" && (pior.acao === "publicar" || d.ate > pior.ate)) pior = d;
  }
  return pior;
}

export const FRASE_DO_ADIAMENTO: Record<MotivoDoAdiamento, string> = {
  limite_diario: "Aguardando: limite diário de publicações da conta.",
  intervalo: "Aguardando o intervalo mínimo entre publicações.",
  pausa_de_lote: "Aguardando a pausa entre lotes de publicações.",
};
