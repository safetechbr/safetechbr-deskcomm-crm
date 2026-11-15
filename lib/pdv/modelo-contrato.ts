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
  // ---- Dados que as cláusulas fixas do modelo pedem (ficha 01). ----
  /** Hora prevista da entrega do vendido (HH:MM). */
  entrega_hora: campo.optional(),
  recebimento_troca_hora: campo.optional(),
  /** Quem assina pela loja. */
  representante_nome: campo.optional(),
  representante_cpf: campo.optional(),
  representante_cargo: campo.optional(),
  /** Cl. 3.1: data da consulta de débitos no Detran e o que ela mostrou. */
  consulta_debitos_em: campo.optional(),
  debitos: z
    .object({
      ipva_licenciamento: campo,
      multas: campo,
      restricoes: campo,
      leilao_sinistro: campo,
      recall: campo,
      /** Quem paga os débitos anteriores à entrega. */
      responsavel: z.enum(["vendedora", "comprador"]).optional(),
    })
    .partial()
    .optional(),
  test_drive: z.enum(["fez", "dispensou"]).optional(),
  /** Cl. 5ª. */
  transferencia_taxas_por: z.enum(["comprador", "vendedora"]).optional(),
  transferencia_prazo_dias: z.number().int().min(1).max(90).optional(),
  transferencia_conta_de: z.enum(["assinatura", "quitacao"]).optional(),
  despachante_cents: z.number().int().min(0).max(100000000000).optional(),
  /** Cl. 2.6: prazo da loja para quitar o gravame da troca. */
  quitacao_troca_prazo_dias: z.number().int().min(1).max(90).optional(),
  /** Cl. 7.1: prazo de liberação do financiamento. */
  financiamento_prazo_dias: z.number().int().min(1).max(90).optional(),
  /** Cl. 7.3: retenção mensal pelo uso, em caso de desfazimento. */
  retencao_percentual_mes: z.number().min(0).max(10).optional(),
  /** Cl. 6.4: garantia contratual, opcional. */
  garantia_contratual: z
    .object({ prazo: campo, componentes: z.string().trim().max(1000).default("") })
    .optional(),
  /** Cl. 8.2: venda fora do estabelecimento dá arrependimento de 7 dias. */
  venda_fora_do_estabelecimento: z.boolean().optional(),
  email_lgpd: campo.optional(),
  testemunhas: z
    .array(z.object({ nome: campo, cpf: campo }))
    .max(2)
    .optional(),
});
export type DadosDoContrato = z.infer<typeof contratoSchema>;
export const configuracaoContratoSchema = empresaContratoSchema
  .omit({ razao_social: true, nome_fantasia: true, cnpj: true })
  .extend({
    clausulas: z.array(z.string().trim().min(1).max(6000)).max(30).optional(),
    representante_nome: campo.optional(),
    representante_cpf: campo.optional(),
    representante_cargo: campo.optional(),
    email_lgpd: campo.optional(),
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
    ...(config.success
      ? Object.fromEntries(
          (["representante_nome", "representante_cpf", "representante_cargo", "email_lgpd"] as const)
            .filter((k) => config.data[k])
            .map((k) => [k, config.data[k]]),
        )
      : {}),
    clausulas: [
      ...(config.success ? (config.data.clausulas ?? CLAUSULAS_DO_MODELO) : CLAUSULAS_DO_MODELO),
    ],
  };
}
