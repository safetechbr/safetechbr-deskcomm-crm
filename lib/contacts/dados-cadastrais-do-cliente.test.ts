import { describe, expect, it } from "vitest";
import { contactCreateSchema } from "@/lib/schemas/contacts";
import { mesclarCadastroDoCliente } from "./dados-cadastrais-do-cliente";
describe("complementos do cadastro do cliente", () => {
  it("valida o bloco usado pelo mesmo cadastro e preserva os campos de outras áreas", () => {
    const input = contactCreateSchema.parse({
      name: "Cliente",
      custom_fields: {
        origem_venda: "loja",
        cadastro_cliente: { nacionalidade: "Brasileira", cnpj: "11222333000181", uf: "PI" },
      },
    });
    expect(input.custom_fields?.cadastro_cliente).toMatchObject({ cnpj: "11222333000181" });
    expect(
      mesclarCadastroDoCliente(
        { outro: "preservado", cadastro_cliente: { cidade: "Cidade" } },
        { cadastro_cliente: { rg: "RG" } },
      ),
    ).toEqual({ outro: "preservado", cadastro_cliente: { cidade: "Cidade", rg: "RG" } });
  });
  it("recusa CPF nesse bloco e tipos ou tamanhos inválidos", () => {
    for (const cadastro_cliente of [
      { cpf: "52998224725" },
      { cnpj: "123" },
      { nacionalidade: "x".repeat(81) },
      { endereco: { rua: "x" } },
    ]) {
      expect(contactCreateSchema.safeParse({ custom_fields: { cadastro_cliente } }).success).toBe(
        false,
      );
    }
  });
});
