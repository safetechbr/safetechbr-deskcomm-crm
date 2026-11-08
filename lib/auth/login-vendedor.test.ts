import { describe, it, expect } from "vitest";
import { emailDoLogin, identidadeDoLogin, loginDoEmail } from "./login-vendedor";
import { loginSchema } from "./schemas";

describe("login do vendedor", () => {
  it("normaliza login e e-mail para a mesma identidade e o mesmo limite de tentativas", () => {
    expect(identidadeDoLogin(" Joao ")).toBe(emailDoLogin("joao"));
    expect(identidadeDoLogin("JOAO@usuarios.login.invalid")).toBe(emailDoLogin("joao"));
    expect(loginDoEmail(emailDoLogin("joao"))).toBe("joao");
    expect(identidadeDoLogin(" Dono@Empresa.com ")).toBe("dono@empresa.com");
  });
  it("aceita login sem e-mail e preserva a validação da senha", () => {
    expect(loginSchema.safeParse({ email: "joao", password: "UmaSenha123" }).success).toBe(true);
    for (const email of ["jo", "joao silva", "joão", "a@", "../joao"]) {
      expect(loginSchema.safeParse({ email, password: "UmaSenha123" }).success).toBe(false);
    }
    expect(loginSchema.safeParse({ email: "joao", password: "123" }).success).toBe(false);
    expect(loginDoEmail("dono@empresa.com")).toBeNull();
  });
});
