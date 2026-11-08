import { z } from "zod";
export const operacaoCrediarioSchema = z.discriminatedUnion("operacao", [
  z.object({ operacao: z.literal("receber"), parcela_id: z.string().uuid() }),
  z.object({
    operacao: z.literal("editar"),
    parcela_id: z.string().uuid(),
    valor_cents: z.number().int().positive().max(100_000_000_000),
    vencimento: z.iso.date(),
  }),
  z.object({
    operacao: z.literal("recalcular"),
    parcelas: z.number().int().min(1).max(120),
    vencimento: z.iso.date(),
    juros_bps: z.number().int().min(0).max(10000).default(0),
  }),
]);
export function distribuirParcelas(total: number, quantidade: number) {
  if (
    !Number.isSafeInteger(total) ||
    !Number.isInteger(quantidade) ||
    quantidade < 1 ||
    quantidade > 120 ||
    total < quantidade
  )
    throw new Error("Parcelamento inválido.");
  return Array.from(
    { length: quantidade },
    (_, i) => Math.floor(total / quantidade) + (i < total % quantidade ? 1 : 0),
  );
}
export interface ParcelaCrediario {
  id: string;
  negociacao_id: string;
  amount_cents: number;
  due_date: string;
  status: string;
  paid_at: string | null;
  parcela_numero: number;
}
export interface Crediario {
  id: string;
  numero: number;
  cliente: { nome: string };
  parcelas: ParcelaCrediario[];
}
