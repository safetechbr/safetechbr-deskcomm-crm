/**
 * Silêncio de sessão — a sessão do WhatsApp que está "WORKING" mas surda.
 *
 * ## O defeito
 *
 * O WAHA/NOWEB pode ficar com a sessão `WORKING` e parar de repassar as
 * mensagens RECEBIDAS (chaves dessincronizadas, "identity changed" nos logs),
 * enquanto o envio segue normal. O `channel-health` só olha o STATUS, que
 * continua verde; o CRM parece vivo e o cliente fica sem resposta. Incidente de
 * 2026-11-10: horas sem entrada até alguém notar.
 *
 * ## A regra (pura, sem rede nem banco — o teste cobre tudo)
 *
 * - Só sessão `WORKING`. Sessão `FAILED`/`SCAN_QR_CODE`/`STOPPED` já tem o seu
 *   aviso e a doutrina do repo é nunca religá-la daqui.
 * - Só há "silêncio" no horário comercial: de madrugada ninguém escreve, e
 *   alarmar aí treinaria o operador a ignorar o aviso.
 * - Só em conta que costuma receber: sem entrada nos últimos
 *   `DIAS_DE_HISTORICO` dias, a conta é naturalmente quieta, não surda.
 * - Limiar: `LIMIAR_DE_SILENCIO_MS` desde a última mensagem recebida.
 * - Reinício automático: no máximo 1 a cada `INTERVALO_ENTRE_REINICIOS_MS` e no
 *   máximo `MAXIMO_DE_REINICIOS` seguidos. Esgotado, só avisa — reiniciar em
 *   laço de uma sessão que um restart não cura só gasta o canal.
 * - Nunca reinicia com envio em andamento.
 */

export const LIMIAR_DE_SILENCIO_MS = 2 * 60 * 60 * 1000;
export const DIAS_DE_HISTORICO = 7;
export const INTERVALO_ENTRE_REINICIOS_MS = 30 * 60 * 1000;
export const MAXIMO_DE_REINICIOS = 3;

/** Horário comercial (fuso e janela fixos; seg–sáb, 08h–20h). */
export const FUSO_COMERCIAL = "America/Sao_Paulo";
export const HORA_DE_ABRIR = 8;
export const HORA_DE_FECHAR = 20;

export interface EstadoDeReinicio {
  /** Reinícios seguidos sem que voltasse mensagem. */
  tentativas: number;
  /** ISO da última tentativa. */
  ultima_tentativa_em: string | null;
}

export const SEM_REINICIOS: EstadoDeReinicio = { tentativas: 0, ultima_tentativa_em: null };

export interface EntradaDoSilencio {
  status: string;
  /** Última mensagem recebida na sessão; `null` = nunca. */
  ultimaEntradaEm: Date | null;
  agora: Date;
  estado: EstadoDeReinicio;
  /** Há mensagem em `sending` recente nesta sessão. */
  envioEmAndamento: boolean;
}

export type DesfechoDoSilencio =
  | { acao: "normal" }
  /** Sem silêncio a tratar agora (fora do horário, conta quieta, sessão não-WORKING). */
  | { acao: "ignorar"; motivo: "status" | "fora_do_horario" | "conta_quieta" }
  | { acao: "avisar_e_reiniciar"; silencioMs: number; tentativa: number }
  /** Silêncio confirmado, mas o reinício não cabe agora (cooldown, envio, teto). */
  | { acao: "so_avisar"; silencioMs: number; motivo: "cooldown" | "envio_em_andamento" | "teto_de_tentativas" };

/** Dentro do horário comercial no fuso de São Paulo (seg–sáb, 08h–20h). */
export function emHorarioComercial(agora: Date): boolean {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO_COMERCIAL,
    hour: "numeric",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(agora);
  const hora = Number(partes.find((p) => p.type === "hour")?.value);
  const dia = partes.find((p) => p.type === "weekday")?.value;
  if (dia === "Sun") return false;
  return hora >= HORA_DE_ABRIR && hora < HORA_DE_FECHAR;
}

export function avaliarSilencio(e: EntradaDoSilencio): DesfechoDoSilencio {
  if (e.status !== "WORKING") return { acao: "ignorar", motivo: "status" };

  const ultima = e.ultimaEntradaEm;
  const historicoMs = DIAS_DE_HISTORICO * 24 * 60 * 60 * 1000;
  if (!ultima || e.agora.getTime() - ultima.getTime() > historicoMs) {
    return { acao: "ignorar", motivo: "conta_quieta" };
  }

  if (!emHorarioComercial(e.agora)) return { acao: "ignorar", motivo: "fora_do_horario" };

  // O silêncio só conta o tempo em que a conta estava "aberta": passada a noite,
  // a última entrada é de ontem à tarde e o relógio bruto acusaria surdez. Exige
  // que o limiar inteiro caiba dentro do horário comercial.
  const silencioMs = e.agora.getTime() - ultima.getTime();
  if (silencioMs < LIMIAR_DE_SILENCIO_MS) return { acao: "normal" };
  if (!emHorarioComercial(new Date(e.agora.getTime() - LIMIAR_DE_SILENCIO_MS))) {
    return { acao: "normal" };
  }

  if (e.estado.tentativas >= MAXIMO_DE_REINICIOS) {
    return { acao: "so_avisar", silencioMs, motivo: "teto_de_tentativas" };
  }
  const ultimaTentativa = e.estado.ultima_tentativa_em ? Date.parse(e.estado.ultima_tentativa_em) : NaN;
  if (Number.isFinite(ultimaTentativa) && e.agora.getTime() - ultimaTentativa < INTERVALO_ENTRE_REINICIOS_MS) {
    return { acao: "so_avisar", silencioMs, motivo: "cooldown" };
  }
  if (e.envioEmAndamento) return { acao: "so_avisar", silencioMs, motivo: "envio_em_andamento" };

  return { acao: "avisar_e_reiniciar", silencioMs, tentativa: e.estado.tentativas + 1 };
}
