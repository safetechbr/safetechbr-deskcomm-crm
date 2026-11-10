/**
 * Regras de criação dos Stories: horários sugeridos, repetição e validação do arquivo.
 * Porta do PostPlan. PURO e em hora local do navegador.
 */

export const REGRAS_DE_STORY = {
  max_por_serie: 100,
  imagem: { tipos: ["image/jpeg", "image/png"], max_bytes: 8 * 1024 * 1024 },
  video: { tipos: ["video/mp4", "video/quicktime"], max_bytes: 100 * 1024 * 1024, min_s: 3, max_s: 60 },
} as const;

export const PRIMEIRA_HORA = 8; // a grade pré-definida começa às 08:00
export const ULTIMA_HORA_PREDEFINIDA = 10; // …e vai até 10:00
export const FOLGA_DE_HOJE_MIN = 10; // hoje: pelo menos 10 min à frente, para dar tempo de subir a mídia
export const INTERVALO_EM_SEQUENCIA_MIN = 3; // entre Stories em sequência, para o anterior sair primeiro

/** Horários pré-definidos do dia: 08:00, 08:03 … 10:00. */
export function horariosPredefinidos(dia: Date): Date[] {
  const out: Date[] = [];
  for (let m = PRIMEIRA_HORA * 60; m <= ULTIMA_HORA_PREDEFINIDA * 60; m += INTERVALO_EM_SEQUENCIA_MIN)
    out.push(new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), Math.floor(m / 60), m % 60));
  return out;
}

/**
 * Sugere data/hora para um novo Story no dia: o primeiro horário livre da grade das 08:00
 * às 10:00 (sem ficar a menos de 3 min de outro Story; hoje, com 10 min de folga). Passou da
 * grade: 3 min depois do último Story do dia.
 */
export function sugerirHorario(
  dia: Date,
  existentes: { agendada_para: string; status: string }[],
  agora: Date = new Date(),
): Date {
  const ehHoje = dia.toDateString() === agora.toDateString();
  const maisCedo = ehHoje ? agora.getTime() + FOLGA_DE_HOJE_MIN * 60_000 : 0;
  const folga = INTERVALO_EM_SEQUENCIA_MIN * 60_000;
  const ocupados = existentes
    .filter((s) => s.status !== "cancelada" && new Date(s.agendada_para).toDateString() === dia.toDateString())
    .map((s) => new Date(s.agendada_para).getTime());

  const livre = horariosPredefinidos(dia).find(
    (h) => h.getTime() >= maisCedo && ocupados.every((t) => Math.abs(t - h.getTime()) >= folga),
  );
  if (livre) return livre;

  let sugerido = ehHoje
    ? new Date(maisCedo)
    : new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), ULTIMA_HORA_PREDEFINIDA, 0);
  const ultimo = Math.max(...ocupados, 0);
  if (ultimo && ultimo + folga > sugerido.getTime()) sugerido = new Date(ultimo + folga);
  if (sugerido.getSeconds() > 0 || sugerido.getMilliseconds() > 0)
    sugerido = new Date(sugerido.getFullYear(), sugerido.getMonth(), sugerido.getDate(), sugerido.getHours(), sugerido.getMinutes() + 1);
  return sugerido;
}

/** Repetição por dias da semana: o original + os dias escolhidos por N semanas, no mesmo horário. */
export function datasPorDiasDaSemana(base: Date, diasDaSemana: number[], semanas: number): Date[] {
  const domingo = new Date(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay());
  const porInstante = new Map<number, Date>([[base.getTime(), base]]);
  for (let semana = 0; semana < Math.max(1, semanas); semana++)
    for (const dia of diasDaSemana) {
      const d = new Date(domingo.getFullYear(), domingo.getMonth(), domingo.getDate() + semana * 7 + dia, base.getHours(), base.getMinutes());
      if (d.getTime() >= base.getTime()) porInstante.set(d.getTime(), d);
    }
  return [...porInstante.values()].sort((a, b) => a.getTime() - b.getTime());
}

/** Repetição em datas escolhidas (`YYYY-MM-DD`): o original + cada dia, no horário do original. */
export function datasPorDiasEscolhidos(base: Date, chaves: string[]): Date[] {
  const porInstante = new Map<number, Date>([[base.getTime(), base]]);
  for (const chave of chaves) {
    const [ano, mes, dia] = chave.split("-").map(Number);
    if (!ano || !mes || !dia) continue;
    const d = new Date(ano, mes - 1, dia, base.getHours(), base.getMinutes());
    if (d.getTime() >= base.getTime()) porInstante.set(d.getTime(), d);
  }
  return [...porInstante.values()].sort((a, b) => a.getTime() - b.getTime());
}

/** Valida o arquivo antes do envio. Devolve a mensagem de erro ou `null`. */
export function validarArquivoDeStory(arquivo: { type: string; size: number }, duracaoS?: number): string | null {
  const ehVideo = arquivo.type.startsWith("video/");
  const regra = ehVideo ? REGRAS_DE_STORY.video : REGRAS_DE_STORY.imagem;
  if (!(regra.tipos as readonly string[]).includes(arquivo.type))
    return ehVideo ? "Use vídeo MP4 ou MOV." : "Use imagem JPG ou PNG.";
  if (arquivo.size > regra.max_bytes)
    return `O arquivo passa de ${Math.round(regra.max_bytes / 1024 / 1024)} MB.`;
  if (ehVideo && duracaoS !== undefined) {
    if (duracaoS > REGRAS_DE_STORY.video.max_s)
      return `O vídeo tem ${duracaoS.toFixed(1)}s — o máximo é ${REGRAS_DE_STORY.video.max_s}s.`;
    if (duracaoS < REGRAS_DE_STORY.video.min_s)
      return `O vídeo tem ${duracaoS.toFixed(1)}s — o mínimo é ${REGRAS_DE_STORY.video.min_s}s.`;
  }
  return null;
}
