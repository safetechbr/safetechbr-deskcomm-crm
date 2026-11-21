import { z } from "zod";

export const taxaDeCartaoSchema = z.number().int().min(0).max(9999);
export const repasseDeCartaoSchema = z.enum(["repassar", "absorver"]);

export const idDoPerfilDeCartaoSchema = z.string().min(1).max(64);

export const taxasDeCartaoSchema = z.object({
  padrao: z.number().int().nonnegative().nullable(),
  perfis: z.array(z.object({
    id: idDoPerfilDeCartaoSchema.optional(),
    nome: z.string().trim().min(1).max(80),
    bandeira: z.string().trim().max(40),
    debito: taxaDeCartaoSchema,
    credito: z.array(taxaDeCartaoSchema).min(1).max(120),
  })).max(30),
}).transform(({ padrao, perfis }) => ({
  padrao,
  perfis: perfis.map((perfil, i) => ({ ...perfil, id: perfil.id ?? `legado-${i}` })),
})).refine(({ padrao, perfis }) => (padrao === null || padrao < perfis.length) &&
  new Set(perfis.map((perfil) => perfil.id)).size === perfis.length
);

export type TaxasDeCartao = z.infer<typeof taxasDeCartaoSchema>;

export function lerTaxasDeCartao(settings: unknown): TaxasDeCartao {
  const config = (settings as { taxas_de_cartao?: unknown } | null)?.taxas_de_cartao;
  return taxasDeCartaoSchema.safeParse(config).data ?? { padrao: null, perfis: [] };
}

export function perfilDoCartao(config: TaxasDeCartao, id: string | undefined) {
  return config.perfis.find((perfil) => perfil.id === id);
}

export function calcularCartao(
  valor: number, taxa: number, modo: z.infer<typeof repasseDeCartaoSchema>, parcelas: number,
) {
  const cobrado = modo === "repassar" ? Math.round(valor * 10000 / (10000 - taxa)) : valor;
  return {
    cobrado,
    liquido: cobrado - Math.round(cobrado * taxa / 10000),
    parcela: Math.round(cobrado / parcelas),
  };
}
