import { CLAUSULAS_DO_MODELO } from "./clausulas-modelo";
import { z } from "zod";
const campo = z.string().trim().max(300).default("");
export const camposDaEmpresa = {
  razao_social: "Razão social",
  nome_fantasia: "Nome fantasia",
  cnpj: "CNPJ",
  endereco: "Endereço",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cep: "CEP",
  cidade: "Cidade",
  uf: "UF",
  telefone: "Telefone de contato",
  email: "E-mail de contato",
} as const;
export const empresaContratoSchema = z.object(
  Object.fromEntries(Object.keys(camposDaEmpresa).map((k) => [k, campo])) as Record<
    keyof typeof camposDaEmpresa,
    typeof campo
  >,
);
export type EmpresaContrato = z.infer<typeof empresaContratoSchema>;
export const regularizacaoSchema = z
  .array(
    z.object({
      descricao: z.string().trim().min(1).max(300),
      responsavel: z.enum(["cliente", "loja", "quitado", "a_definir"]),
      observacao: campo,
      valor_cents: z.number().int().min(0).max(100000000000),
    }),
  )
  .max(30);
export const contratoSchema = z.object({
  empresa: empresaContratoSchema.optional(),
  local: campo.optional(),
  assinatura_em: z.string().datetime({ offset: true }).optional(),
  entrega_em: campo.optional(),
  recebimento_troca_em: campo.optional(),
  atendido_por: campo.optional(),
  clausulas: z.array(z.string().trim().min(1).max(6000)).max(30).optional(),
  clausula_especial: z.string().trim().max(6000).optional(),
});
export type DadosDoContrato = z.infer<typeof contratoSchema>;
export const configuracaoContratoSchema = empresaContratoSchema
  .omit({ razao_social: true, nome_fantasia: true, cnpj: true })
  .extend({
    clausulas: z.array(z.string().trim().min(1).max(6000)).max(30).optional(),
  });
export function empresaDoCadastro(org: {
  legal_name?: string;
  display_name?: string;
  cnpj?: string | null;
  dados_contrato?: unknown;
}): EmpresaContrato {
  const extra = configuracaoContratoSchema.safeParse(org.dados_contrato ?? {});
  return empresaContratoSchema.parse({
    ...(extra.success ? extra.data : {}),
    razao_social: org.legal_name ?? "",
    nome_fantasia: org.display_name ?? "",
    cnpj: org.cnpj ?? "",
  });
}

export type CadastroDaEmpresa = Parameters<typeof empresaDoCadastro>[0];
/** Copia os padrões uma vez. Nunca consultar os padrões ao reimprimir esta fotografia. */
export function novoContrato(
  org: CadastroDaEmpresa,
  agora = new Date().toISOString(),
): DadosDoContrato {
  const empresa = empresaDoCadastro(org);
  const config = configuracaoContratoSchema.safeParse(org.dados_contrato ?? {});
  return {
    empresa,
    local: [empresa.cidade, empresa.uf].filter(Boolean).join("/"),
    assinatura_em: agora,
    clausulas: [
      ...(config.success ? (config.data.clausulas ?? CLAUSULAS_DO_MODELO) : CLAUSULAS_DO_MODELO),
    ],
  };
}
