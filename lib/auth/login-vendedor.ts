import { z } from "zod";

// Identidade interna do provedor: não é uma caixa postal e não recebe mensagens.
// A unicidade do e-mail no Auth também torna o login único nesta instalação.
const DOMINIO = "usuarios.login.invalid";
export const loginVendedorSchema = z.string().trim().toLowerCase().min(3).max(40)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, "Use de 3 a 40 letras sem acento, números, ponto, hífen ou sublinhado.");

export function emailDoLogin(login: string): string {
  return `${loginVendedorSchema.parse(login)}@${DOMINIO}`;
}

export function loginDoEmail(email?: string | null): string | null {
  const sufixo = `@${DOMINIO}`;
  if (!email?.endsWith(sufixo)) return null;
  const login = loginVendedorSchema.safeParse(email.slice(0, -sufixo.length));
  return login.success ? login.data : null;
}

export function identidadeDoLogin(entrada: string): string {
  const valor = entrada.trim().toLowerCase();
  return valor.includes("@") ? valor : emailDoLogin(valor);
}
