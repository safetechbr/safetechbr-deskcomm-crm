import { z } from "zod";

export const reservaDeVeiculoSchema = z.object({
  duracao_horas: z.number().int().min(1).max(24).default(24),
  conversation_id: z.string().uuid(),
  visita_em: z.string().datetime({ offset: true }).optional(),
});

export interface ReservaDeVeiculo {
  id: string;
  veiculo_id: string;
  vendedor_user_id: string;
  conversation_id: string | null;
  criada_em: string;
  expira_em: string;
  visita_em: string | null;
  encerrada_em: string | null;
  vendedor_nome?: string | null;
}

/** Prazo é a verdade: disponibilidade não depende de cron nem de aba aberta. */
export function reservaAtiva(r: ReservaDeVeiculo | null | undefined, agora = Date.now()): r is ReservaDeVeiculo {
  return !!r && !r.encerrada_em && Date.parse(r.expira_em) > agora;
}

export function bloqueioDoVeiculo(
  status: string, reserva: ReservaDeVeiculo | null | undefined, usuarioId?: string | null,
): string | null {
  if (status !== "disponivel") return status === "vendido" ? "Este veículo já foi vendido." : "Este veículo está indisponível no estoque.";
  if (reservaAtiva(reserva) && reserva.vendedor_user_id !== usuarioId)
    return `Reservado por ${reserva.vendedor_nome || "outro vendedor"} até ${new Date(reserva.expira_em).toLocaleString("pt-BR")}.`;
  return null;
}
