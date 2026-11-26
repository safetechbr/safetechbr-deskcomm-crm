import { exemploDeContrato } from "@/tests/fixtures/negociacao-contrato";
import type { Negociacao } from "@/lib/pdv/regras";
import { ITENS_DA_VISTORIA } from "@/lib/pdv/laudo-vistoria";

/** Venda simples com todos os dados que o modelo imprime. Dados sintéticos. */
export function vendaCompleta(): Negociacao {
  const base = structuredClone(exemploDeContrato);
  return {
    ...base,
    veiculo_id: "fb000000-0000-4000-8000-0000000000a1",
    cliente: {
      ...base.cliente,
      documento: "52998224725",
      bairro: "Centro",
      cep: "64000000",
      codigo_municipio: "2211001",
      cnh: "01234567890",
    },
    troca: null,
    desconto_cents: 0,
    pagamentos: [
      {
        forma: "pix",
        valor_cents: 8_000_000,
        parcelas: 1,
        conta_id: null,
        data_pagamento: "2026-11-11",
      },
    ],
    contrato: {
      ...base.contrato!,
      empresa: { ...base.contrato!.empresa!, cnpj: "11222333000181" },
      recebimento_troca_em: undefined,
      entrega_chaves: 2,
      estado_veiculo: {
        lataria: "sem avarias",
        interior: "bom estado",
        pneus: "meia-vida",
        itens: "manual, chave de roda, macaco e triângulo",
        observacoes: "",
      },
    },
  };
}

export function comTroca(n: Negociacao, quitacao = 500_000): Negociacao {
  return {
    ...n,
    troca: {
      marca: "Marca Exemplo",
      modelo: "Modelo da troca",
      ano_fabricacao: 2018,
      ano_modelo: 2019,
      placa: "BBB0B00",
      chassi: "9BWZZZ377VT004251",
      renavam: "11111111111",
      cor: "Prata",
      ncm: "87032100",
      km: 55000,
      valor_cents: 2_000_000,
      quitacao_cents: quitacao,
      gravame_credor: "Banco Credor Exemplo",
      entra_no_estoque: true,
      regularizacao: [
        { descricao: "Gravame", responsavel: "loja", observacao: "", valor_cents: quitacao },
      ],
    },
    // 80.000 − 20.000 + 5.000 = 65.000
    pagamentos: [
      { forma: "financiamento", banco: "Banco Exemplo", valor_cents: 6_000_000, parcelas: 36 },
      { forma: "pix", valor_cents: 500_000, parcelas: 1 },
    ],
    contrato: { ...n.contrato!, recebimento_troca_em: "2026-11-12", recebimento_troca_chaves: 1 },
  };
}

/** Venda nova, com o laudo de vistoria completo no lugar do anexo antigo. Dados sintéticos. */
export function comVistoria(n: Negociacao): Negociacao {
  const itens = Object.fromEntries(ITENS_DA_VISTORIA.map(([k]) => [k, { estado: "B" as const }]));
  return {
    ...n,
    contrato: {
      ...n.contrato!,
      estado_veiculo: undefined,
      vistoria: {
        data: "2026-11-10",
        hora: "10:00",
        vistoriador: "",
        comprador_acompanhou: true,
        km: 10000,
        identificacao: {
          placa: "confere",
          chassi: "confere",
          motor: "confere",
          renavam: "confere",
          remarcacao: "nao",
        },
        itens,
      },
    },
  };
}

/** Venda com o termo de entrega preenchido no ato. Dados sintéticos. */
export function comTermoEntrega(n: Negociacao): Negociacao {
  return {
    ...n,
    contrato: {
      ...n.contrato!,
      termo_entrega: {
        combustivel: "1/2",
        funcionario: { nome: "Funcionário de Teste", cpf: "000.000.000-00" },
        itens: {
          chave_principal: { entregue: true },
          chave_reserva: { entregue: true },
          manual_proprietario: { entregue: false, obs: "não veio de fábrica" },
          estepe: { entregue: true },
        },
        fotos: 4,
      },
    },
  };
}
