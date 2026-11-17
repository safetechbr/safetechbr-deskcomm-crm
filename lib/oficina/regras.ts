import { z } from "zod";

/**
 * A OFICINA — todo carro comprado ou recebido em troca entra `em_oficina` e só
 * vira `disponivel` (Estoque) quando a loja o libera. Tudo aqui é INTERNO:
 * custo de compra, reparos e custo total nunca chegam ao cliente, a contrato,
 * comprovante ou rota pública (`regras.test.ts` e `nao-vaza.test.ts` vigiam).
 */

export const STATUS_EM_OFICINA = "em_oficina";

/** Colunas lidas só na Oficina (manager+); `COLUNAS_DO_VEICULO` nunca as inclui. */
export const COLUNAS_DA_OFICINA =
  "id, codigo, marca, modelo, versao, ano_fabricacao, ano_modelo, km, cor, placa, preco_cents, moeda, custo_cents, entrada_em, status";

export const itemDaOsSchema = z.object({
  descricao: z.string().trim().min(1).max(200),
  valor_cents: z.number().int().min(0).max(100_000_000_00),
});
export const osSchema = z.object({ itens: z.array(itemDaOsSchema).max(100) });

export const custoPatchSchema = z.object({
  custo_cents: z.number().int().min(0).max(100_000_000_00),
});

export const liberarSchema = z.object({
  /** Preço de venda; obrigatório se o carro ainda não tem. */
  preco_cents: z.number().int().min(1).max(100_000_000_00).optional(),
});

export interface ItemDaOs {
  id?: string;
  descricao: string;
  valor_cents: number;
}

export interface VeiculoNaOficina {
  id: string;
  codigo: string;
  marca: string | null;
  modelo: string;
  versao: string | null;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  km: number | null;
  cor: string | null;
  placa: string | null;
  preco_cents: number;
  moeda: string;
  custo_cents: number | null;
  entrada_em: string;
  status: string;
  reparos: ItemDaOs[];
}

export function totalDosReparos(itens: Pick<ItemDaOs, "valor_cents">[]): number {
  return itens.reduce((s, i) => s + i.valor_cents, 0);
}

/** Custo total do veículo = custo de compra + soma dos reparos (centavos). */
export function custoTotalDoVeiculo(
  custoDeCompraCents: number | null | undefined,
  itens: Pick<ItemDaOs, "valor_cents">[],
): number {
  return (custoDeCompraCents ?? 0) + totalDosReparos(itens);
}
