/**
 * Regras puras do cadastro de cliente aberto pelo "+" do PDV.
 *
 * A validação é a mesma da venda (`pendenciasParaConcluir`): nome obrigatório e,
 * se houver documento, ele precisa ser um CPF/CNPJ válido. O corpo enviado ao
 * CRM usa só o que o contato guarda hoje (nome, telefone, e-mail, CPF,
 * nascimento) — RG, CNH e endereço seguem no rascunho da negociação.
 */
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
  phone_number?: string;
  email?: string;
  cpf?: string;
  birthdate?: string;
}

/** Corpo do `POST /api/v1/contacts`. Campo vazio é omitido; o servidor normaliza o telefone. */
export function corpoDoContato(c: ClienteDaNegociacao): CorpoDoContato {
  const corpo: CorpoDoContato = { name: c.nome.trim() };
  const telefone = (c.telefone ?? "").trim();
  if (telefone) corpo.phone_number = telefone;
  const email = (c.email ?? "").trim();
  if (email) corpo.email = email;
  const digitos = (c.documento ?? "").replace(/\D/g, "");
  if (digitos.length === 11) corpo.cpf = digitos;
  const nascimento = (c.nascimento ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) corpo.birthdate = nascimento;
  return corpo;
}
