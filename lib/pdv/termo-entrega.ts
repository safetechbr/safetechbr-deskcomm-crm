import { z } from "zod";

/**
 * Termo de entrega e responsabilidade (anexo do contrato de venda).
 * Data, hora, km e chaves da entrega continuam em `contrato.entrega_*`;
 * o resto do ato de entrega fica em `contrato.termo_entrega` (jsonb).
 * Faltas aqui são avisos: o termo é preenchido no ato da entrega.
 */

const texto = z.string().trim().max(300).default("");

export const COMBUSTIVEIS = [
  ["reserva", "Reserva"],
  ["1/4", "1/4"],
  ["1/2", "1/2"],
  ["3/4", "3/4"],
  ["cheio", "Cheio"],
] as const;

/** Itens conferidos no ato da entrega, na ordem da tabela do termo. */
export const ITENS_DA_ENTREGA = [
  ["chave_principal", "Chave principal"],
  ["chave_reserva", "Chave reserva"],
  ["manual_proprietario", "Manual do proprietário"],
  ["manual_manutencao", "Manual de manutenção / revisões"],
  ["estepe", "Estepe"],
  ["macaco_chave_roda", "Macaco e chave de roda"],
  ["triangulo", "Triângulo"],
  ["tapetes", "Tapetes"],
  ["antena_som", "Antena / frente do som"],
  ["crlv", "CRLV-e (documento de porte)"],
  ["outro", "Outro"],
] as const;
export type ItemDaEntrega = (typeof ITENS_DA_ENTREGA)[number][0];

const itemDaEntrega = z.object({ entregue: z.boolean().optional(), obs: texto }).partial();
const pessoa = z.object({ nome: texto, cpf: texto }).partial();

export const termoEntregaSchema = z
  .object({
    /** Em branco, vale o endereço da loja. */
    local: texto,
    /** Em branco, entrega o representante da loja. */
    funcionario: pessoa.optional(),
    /** Terceiro que retira no lugar do COMPRADOR, com autorização escrita. */
    retirada_por: pessoa.extend({ cnh: texto }).partial().optional(),
    combustivel: z.enum(["reserva", "1/4", "1/2", "3/4", "cheio"]).optional(),
    itens: z
      .object(
        Object.fromEntries(ITENS_DA_ENTREGA.map(([k]) => [k, itemDaEntrega.optional()])) as Record<
          ItemDaEntrega,
          z.ZodOptional<typeof itemDaEntrega>
        >,
      )
      .partial()
      .optional(),
    fotos: z.number().int().min(0).max(500).optional(),
    /** Avaria ou observação notada no ato da entrega (além do laudo). */
    avarias: z.string().trim().max(1000).default(""),
  })
  .partial();
export type TermoDeEntrega = z.infer<typeof termoEntregaSchema>;

const preenchido = (s: string | undefined | null) => (s ?? "").trim() !== "";

export interface FaltaDoTermo {
  campo: string;
  mensagem: string;
}

/** O que sairia em branco no termo. Só avisos: a entrega acontece depois da venda. */
export function faltasDoTermoDeEntrega(t: TermoDeEntrega): FaltaDoTermo[] {
  const out: FaltaDoTermo[] = [];
  const falta = (campo: string, mensagem: string) =>
    out.push({ campo: `termo_entrega.${campo}`, mensagem });
  if (!t.combustivel) falta("combustivel", "Informe o nível de combustível na entrega.");
  if (!Object.values(t.itens ?? {}).some((i) => i?.entregue != null))
    falta("itens", "Confira os itens entregues com o veículo.");
  const r = t.retirada_por;
  if (r && preenchido(r.nome) && !preenchido(r.cpf))
    falta("retirada_por.cpf", "Informe o CPF de quem retira o veículo.");
  return out;
}
