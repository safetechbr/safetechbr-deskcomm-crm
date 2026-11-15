import { z } from "zod";

const texto = (max: number) => z.string().trim().max(max).optional().nullable();
/** Complementos do cadastro existente. CPF continua exclusivamente no mecanismo cifrado do contato. */
export const dadosCadastraisDoClienteSchema = z
  .object({
    nacionalidade: texto(80),
    estado_civil: texto(40),
    profissao: texto(80),
    rg: texto(30),
    rg_orgao_expedidor: texto(20),
    rg_uf: texto(2),
    cnh: texto(30),
    cnpj: z
      .string()
      .regex(/^\d{14}$/)
      .optional()
      .nullable(),
    endereco: texto(200),
    numero: texto(20),
    complemento: texto(100),
    bairro: texto(100),
    cep: texto(10),
    cidade: texto(100),
    uf: texto(2),
  })
  .strict();

/** Atualização cadastral por telefone complementa os dados, sem apagar campos omitidos. */
export function mesclarCadastroDoCliente(
  anterior: Record<string, unknown>,
  novo: Record<string, unknown>,
) {
  const a = dadosCadastraisDoClienteSchema.safeParse(anterior.cadastro_cliente);
  const n = dadosCadastraisDoClienteSchema.safeParse(novo.cadastro_cliente);
  return {
    ...anterior,
    ...novo,
    ...(n.success ? { cadastro_cliente: { ...(a.success ? a.data : {}), ...n.data } } : {}),
  };
}
