/**
 * Regras puras do cadastro de cliente aberto pelo "+" do PDV.
 *
 * A validação é a mesma da venda (`pendenciasParaConcluir`): nome obrigatório e,
 * se houver documento, ele precisa ser um CPF/CNPJ válido. O corpo enviado ao
 * CRM usa as colunas canônicas e os complementos em custom_fields.cadastro_cliente.
 * O CPF não é duplicado no JSON: segue cifrado pelo handler de contatos.
 */
import type { z } from "zod";
import { dadosCadastraisDoClienteSchema } from "@/lib/contacts/dados-cadastrais-do-cliente";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { documentoValido, type ClienteDaNegociacao } from "@/lib/pdv/regras";

export interface ErrosDoCadastro {
  nome?: true;
  documento?: true;
}

export function validarCadastroDeCliente(c: ClienteDaNegociacao): ErrosDoCadastro {
  const erros: ErrosDoCadastro = {};
  if (!c.nome.trim()) erros.nome = true;
  const temDocumento = (c.documento ?? "").replace(/\D/g, "").length > 0;
  if (temDocumento && !documentoValido(c.documento)) erros.documento = true;
  return erros;
}

export interface CorpoDoContato {
  name: string;
  reuse_existing_phone: true;
  phone_number?: string;
  email?: string;
  cpf?: string;
  birthdate?: string;
  custom_fields?: { cadastro_cliente: z.infer<typeof dadosCadastraisDoClienteSchema> };
}

/** Corpo do `POST /api/v1/contacts`. Campo vazio é omitido; o servidor normaliza o telefone. */
export function corpoDoContato(c: ClienteDaNegociacao, editar = false): CorpoDoContato {
  const corpo: CorpoDoContato = { name: c.nome.trim(), reuse_existing_phone: true };
  const telefone = (c.telefone ?? "").trim();
  if (telefone) corpo.phone_number = telefone;
  const email = (c.email ?? "").trim();
  if (email) corpo.email = email;
  const digitos = (c.documento ?? "").replace(/\D/g, "");
  if (digitos.length === 11) corpo.cpf = digitos;
  const nascimento = (c.nascimento ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) corpo.birthdate = nascimento;
  const extras: Record<string, string | null> = {};
  for (const k of [
    "nacionalidade",
    "estado_civil",
    "profissao",
    "rg",
    "rg_orgao_expedidor",
    "rg_uf",
    "cnh",
    "endereco",
    "numero",
    "complemento",
    "bairro",
    "cep",
    "cidade",
    "uf",
  ] as const) {
    if (c[k]?.trim()) extras[k] = c[k]!.trim();
    else if (editar) extras[k] = null;
  }
  if (digitos.length === 14) extras.cnpj = digitos;
  else if (digitos.length === 11 || editar) extras.cnpj = null;
  if (Object.keys(extras).length)
    corpo.custom_fields = { cadastro_cliente: dadosCadastraisDoClienteSchema.parse(extras) };
  return corpo;
}

export interface ContatoDoCadastro {
  id: string;
  name: string | null;
  display_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  birthdate?: string | null;
  cpf_decrypted?: string | null;
  custom_fields?: Record<string, unknown> | null;
}
/** A negociação captura o cadastro atual; alterações futuras não reescrevem contratos antigos. */
export function clienteDoContato(
  ct: ContatoDoCadastro,
  documentoInformado?: string | null,
): ClienteDaNegociacao {
  const resultado = dadosCadastraisDoClienteSchema.safeParse(ct.custom_fields?.cadastro_cliente);
  const { cnpj, ...extras } = resultado.success ? resultado.data : { cnpj: undefined };
  return {
    ...extras,
    nome: nomeDoContato(ct) ?? "",
    telefone: ct.phone_number ?? null,
    email: ct.email ?? null,
    nascimento: ct.birthdate ?? null,
    documento: documentoInformado?.trim() || cnpj || ct.cpf_decrypted || null,
  };
}
