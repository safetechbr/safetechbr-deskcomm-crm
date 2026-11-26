import { z } from "zod";

import { COMBUSTIVEIS, type FaltaDoTermo } from "./termo-entrega";

/**
 * Termo de recebimento e responsabilidade do VEÍCULO EM PAGAMENTO (anexo da
 * venda com veículo dado em pagamento). Data, hora, km e chaves continuam em
 * `contrato.recebimento_troca_*`; o resto do ato fica em
 * `contrato.termo_recebimento` (jsonb). Faltas aqui são avisos: o termo é
 * preenchido no ato do recebimento.
 */

const texto = z.string().trim().max(300).default("");

/** Itens conferidos no ato do recebimento, na ordem da tabela do termo. */
export const ITENS_DO_RECEBIMENTO = [
  ["chave_principal", "Chave principal"],
  ["chave_reserva", "Chave reserva"],
  ["manual_proprietario", "Manual do proprietário"],
  ["manual_manutencao", "Manual de manutenção / revisões"],
  ["estepe_macaco", "Estepe, macaco e chave de roda"],
  ["triangulo", "Triângulo"],
  ["crlv", "CRLV-e"],
  ["extrato_saldo", "Extrato do saldo devedor do financiamento"],
  ["comprovantes_ipva", "Comprovantes de IPVA e licenciamento"],
  ["outro", "Outro"],
] as const;
export type ItemDoRecebimento = (typeof ITENS_DO_RECEBIMENTO)[number][0];

/** Perguntas que o COMPRADOR responde sobre o veículo que entrega. */
export const DECLARACOES_DO_CLIENTE = [
  ["dono_legitimo", "É o proprietário do veículo e pode dispor dele"],
  ["sinistro", "O veículo teve sinistro com indenização integral"],
  ["leilao", "O veículo passou por leilão"],
  ["alagamento", "O veículo sofreu alagamento ou enchente"],
  ["remarcacao", "O veículo tem chassi, motor ou vidros remarcados ou adulterados"],
  ["km_real", "A quilometragem do hodômetro é a real"],
  ["modificacoes", "O veículo tem modificação de característica (suspensão, motor, outras)"],
  ["defeito_conhecido", "Conhece defeito do veículo que não esteja aparente"],
] as const;
export type DeclaracaoDoCliente = (typeof DECLARACOES_DO_CLIENTE)[number][0];

export const PAGADORES_DOS_DEBITOS = [
  ["cliente", "COMPRADOR, antes da transferência"],
  ["loja_desconta", "VENDEDORA, descontando do valor da avaliação"],
] as const;

const itemDoRecebimento = z.object({ recebido: z.boolean().optional(), obs: texto }).partial();
const declaracao = z.object({ resposta: z.boolean().optional(), detalhe: texto }).partial();
const pessoa = z.object({ nome: texto, cpf: texto }).partial();

export const termoRecebimentoSchema = z
  .object({
    /** Em branco, vale o endereço da loja. */
    local: texto,
    /** Em branco, recebe o representante da loja. */
    funcionario: pessoa.optional(),
    /** Terceiro que entrega o veículo no lugar do COMPRADOR. */
    entregue_por: pessoa.optional(),
    combustivel: z.enum(["reserva", "1/4", "1/2", "3/4", "cheio"]).optional(),
    itens: z
      .object(
        Object.fromEntries(ITENS_DO_RECEBIMENTO.map(([k]) => [k, itemDoRecebimento.optional()])) as Record<
          ItemDoRecebimento,
          z.ZodOptional<typeof itemDoRecebimento>
        >,
      )
      .partial()
      .optional(),
    fotos: z.number().int().min(0).max(500).optional(),
    avarias: z.string().trim().max(1000).default(""),
    declaracoes: z
      .object(
        Object.fromEntries(DECLARACOES_DO_CLIENTE.map(([k]) => [k, declaracao.optional()])) as Record<
          DeclaracaoDoCliente,
          z.ZodOptional<typeof declaracao>
        >,
      )
      .partial()
      .optional(),
    /** Consulta de débitos do veículo recebido. */
    debitos: z
      .object({
        consulta_em: texto,
        ipva: texto,
        licenciamento: texto,
        multas: texto,
        restricoes: texto,
        pagos_por: z.enum(["cliente", "loja_desconta"]).optional(),
      })
      .partial()
      .optional(),
  })
  .partial();
export type TermoDeRecebimento = z.infer<typeof termoRecebimentoSchema>;

export { COMBUSTIVEIS };

const preenchido = (s: string | undefined | null) => (s ?? "").trim() !== "";

/** O que sairia em branco no termo. Só avisos: o recebimento pode ser depois da assinatura. */
export function faltasDoTermoDeRecebimento(
  t: TermoDeRecebimento,
  ato: { hora?: string | null; km?: number | null } = {},
): FaltaDoTermo[] {
  const out: FaltaDoTermo[] = [];
  const falta = (campo: string, mensagem: string) => out.push({ campo, mensagem });
  if (!preenchido(ato.hora))
    falta("recebimento_troca_hora", "Informe a hora do recebimento do veículo em pagamento.");
  if (ato.km == null)
    falta("recebimento_troca_km", "Informe a quilometragem do veículo em pagamento no recebimento.");
  if (!t.combustivel) falta("termo_recebimento.combustivel", "Informe o nível de combustível no recebimento.");
  if (!Object.values(t.itens ?? {}).some((i) => i?.recebido != null))
    falta("termo_recebimento.itens", "Confira os itens recebidos com o veículo.");
  for (const [k, pergunta] of DECLARACOES_DO_CLIENTE)
    if (t.declaracoes?.[k]?.resposta == null)
      falta(`termo_recebimento.declaracoes.${k}`, `Registre a resposta do cliente: ${pergunta.toLowerCase()}.`);
  const p = t.entregue_por;
  if (p && preenchido(p.nome) && !preenchido(p.cpf))
    falta("termo_recebimento.entregue_por.cpf", "Informe o CPF de quem entrega o veículo.");
  return out;
}
