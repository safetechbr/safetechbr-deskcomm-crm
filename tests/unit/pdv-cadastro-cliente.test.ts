import { describe, expect, it } from "vitest";

import { corpoDoContato, validarCadastroDeCliente } from "@/lib/pdv/cadastro-cliente";

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
    expect(corpoDoContato({ nome: " Ana ", telefone: " ", email: "" })).toEqual({ name: "Ana" });
  });

  it("envia só o que o contato guarda", () => {
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
    });
  });

  it("não manda CNPJ no campo cpf nem nascimento malformado", () => {
    const corpo = corpoDoContato({
      nome: "X",
      documento: "11.222.333/0001-81",
      nascimento: "01/05/1990",
    });
    expect(corpo.cpf).toBeUndefined();
    expect(corpo.birthdate).toBeUndefined();
  });
});
