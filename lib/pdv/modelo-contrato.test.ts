import { describe, expect, it } from "vitest";
import { empresaDoCadastro, novoContrato, contratoSchema } from "./modelo-contrato";
import { negociacaoSchema } from "./regras";
import { veiculoCreateSchema } from "@/lib/veiculos/regras";

describe("modelo contratual da loja", () => {
  it("copia a empresa e as cláusulas sem deixar o contrato antigo depender do cadastro", () => {
    const org = {
      legal_name: "Loja Exemplo LTDA",
      display_name: "Loja Exemplo",
      cnpj: "",
      dados_contrato: {
        cidade: "Cidade Exemplo",
        telefone: "0000000000",
        clausulas: ["Texto revisado pela loja"],
      },
    };
    const contrato = novoContrato(org, "2026-11-11T12:00:00Z");
    org.legal_name = "Outra razão";
    org.dados_contrato.clausulas[0] = "Outro texto";
    expect(contrato.empresa?.razao_social).toBe("Loja Exemplo LTDA");
    expect(contrato.clausulas).toEqual(["Texto revisado pela loja"]);
    expect(contrato.local).toBe("Cidade Exemplo");
    expect(contrato.assinatura_em).toBe("2026-11-11T12:00:00Z");
  });
  it("mantém campos vazios sem inventar dados e admite a remoção das cláusulas", () => {
    expect(empresaDoCadastro({}).telefone).toBe("");
    expect(novoContrato({ dados_contrato: { clausulas: [] } }).clausulas).toEqual([]);
    expect(contratoSchema.safeParse({ clausulas: ["x".repeat(6001)] }).success).toBe(false);
  });
  it("preserva detalhes de veículo, débito, comprador e pagamento no corpo do PDV", () => {
    const r = negociacaoSchema.parse({
      tipo: "venda",
      cliente: { nome: "Cliente Exemplo", nacionalidade: "Brasileira" },
      veiculo: {
        modelo: "Modelo",
        condicao: "usado",
        regularizacao: [{ descricao: "Licenciamento", responsavel: "loja", valor_cents: 12345 }],
      },
      valor_cents: 100000,
      pagamentos: [
        {
          forma: "pix",
          valor_cents: 100000,
          data_pagamento: "2026-11-11",
          chave_pix: "Chave de teste",
        },
      ],
      contrato: novoContrato({}),
    });
    expect(r.cliente.nacionalidade).toBe("Brasileira");
    expect(r.veiculo.regularizacao?.[0]?.valor_cents).toBe(12345);
    expect(r.pagamentos[0]?.data_pagamento).toBe("2026-11-11");
    expect(r.contrato?.empresa).toBeDefined();
    const v = veiculoCreateSchema.parse({
      modelo: "Modelo",
      categoria: "SUV",
      preco_cents: 100000,
      placa: "AAA0A00",
      chassi: "CHASSI-DE-TESTE",
      renavam: "00000000000",
      condicao: "usado",
      regularizacao: r.veiculo.regularizacao,
    });
    expect(v.placa).toBe("AAA0A00");
    expect(v.regularizacao).toEqual(r.veiculo.regularizacao);
  });
});
