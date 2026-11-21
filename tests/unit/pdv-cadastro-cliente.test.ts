import { describe, expect, it } from "vitest";

import {
  corpoDoContato,
  validarCadastroDeCliente,
  clienteDoContato,
} from "@/lib/pdv/cadastro-cliente";

describe("cadastro de cliente do PDV", () => {
  it("exige o nome", () => {
    expect(validarCadastroDeCliente({ nome: "  " })).toEqual({ nome: true });
    expect(validarCadastroDeCliente({ nome: "Ana" })).toEqual({});
  });

  it("recusa documento preenchido e inválido, aceita vazio", () => {
    expect(validarCadastroDeCliente({ nome: "Ana", documento: "123" }).documento).toBe(true);
    expect(validarCadastroDeCliente({ nome: "Ana", documento: "" }).documento).toBeUndefined();
  });

  it("monta o corpo omitindo campos vazios", () => {
    expect(corpoDoContato({ nome: " Ana ", telefone: " ", email: "" })).toEqual({
      name: "Ana",
    });
  });

  it("persiste os dados complementares no mesmo cadastro", () => {
    const corpo = corpoDoContato({
      nome: "Ana",
      telefone: "11999990000",
      email: "a@b.co",
      documento: "529.982.247-25",
      nascimento: "1990-05-01",
      rg: "123",
      cep: "01000-000",
    });
    expect(corpo).toEqual({
      name: "Ana",
      phone_number: "11999990000",
      email: "a@b.co",
      cpf: "52998224725",
      birthdate: "1990-05-01",
      custom_fields: { cadastro_cliente: { rg: "123", cep: "01000-000", cnpj: null } },
    });
  });

  it("não manda CNPJ no campo cpf nem nascimento malformado", () => {
    const corpo = corpoDoContato({
      nome: "X",
      documento: "11.222.333/0001-81",
      nascimento: "01/05/1990",
    });
    expect(corpo.custom_fields?.cadastro_cliente.cnpj).toBe("11222333000181");
    expect(corpo.cpf).toBeUndefined();
    expect(corpo.birthdate).toBeUndefined();
  });
  it("reutiliza cadastro completo para preencher outra negociação", () => {
    const cliente = clienteDoContato({
      id: "c",
      name: "Empresa Exemplo",
      email: "loja@example.test",
      custom_fields: {
        cadastro_cliente: {
          cnpj: "11222333000181",
          nacionalidade: "Brasileira",
          rg: "RG",
          cnh: "CNH",
          endereco: "Rua Exemplo",
          numero: "123",
          cidade: "Cidade",
          uf: "PI",
        },
      },
    });
    expect(cliente).toMatchObject({
      nome: "Empresa Exemplo",
      documento: "11222333000181",
      nacionalidade: "Brasileira",
      rg: "RG",
      cnh: "CNH",
      endereco: "Rua Exemplo",
      numero: "123",
      cidade: "Cidade",
      uf: "PI",
    });
    expect(
      clienteDoContato({ id: "c", name: "Pessoa", cpf_decrypted: "52998224725" }).documento,
    ).toBe("52998224725");
  });
  it("permite limpar complementos na edição explícita sem apagar no cadastro por telefone", () => {
    expect(corpoDoContato({ nome: "Cliente", rg: "" }).custom_fields).toBeUndefined();
    expect(
      corpoDoContato({ nome: "Cliente", rg: "" }, true).custom_fields?.cadastro_cliente.rg,
    ).toBeNull();
  });
});
