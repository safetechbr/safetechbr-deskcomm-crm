import { describe, expect, it } from "vitest";
import { comTroca, vendaCompleta } from "@/tests/fixtures/negociacao-documentos";
import { manifestoDaPasta } from "./manifesto-da-pasta";
import type { Negociacao } from "./regras";
import { faltandoParaConcluir, retratoDaOperacao } from "./retrato-da-operacao";

const bloqueios = (n: Negociacao) =>
  retratoDaOperacao(n).pendencias.filter((p) => p.gravidade === "bloqueia");

describe("retrato da operação", () => {
  it("venda simples completa: sem bloqueios, sem blocos de troca e conciliada", () => {
    const r = retratoDaOperacao(vendaCompleta());
    expect(r.cenario).toBe("venda_simples");
    expect(r.comprador).toBe("pessoa_fisica");
    expect(r.blocos).toMatchObject({ troca: false, quitacao_da_troca: false, desconto: false });
    expect(r.eventos.recebimento_da_troca).toBeNull();
    expect(r.valores).toMatchObject({ saldo_a_pagar_cents: 8_000_000, conciliado: true });
    expect(r.pendencias.filter((p) => p.onde === "troca")).toEqual([]);
    expect(bloqueios(vendaCompleta())).toEqual([]);
  });

  it("venda com troca: saldo = preço − avaliação bruta + quitação assumida − desconto", () => {
    const n = { ...comTroca(vendaCompleta()), desconto_cents: 100_000 };
    n.pagamentos[1]!.valor_cents = 400_000;
    const r = retratoDaOperacao(n);
    expect(r.cenario).toBe("venda_com_troca");
    expect(r.blocos).toMatchObject({
      troca: true,
      quitacao_da_troca: true,
      desconto: true,
      financiamento_bancario: true,
      parcelas_a_loja: false,
    });
    expect(r.valores.saldo_a_pagar_cents).toBe(8_000_000 - 2_000_000 + 500_000 - 100_000);
    expect(r.valores.conciliado).toBe(true);
    expect(r.eventos.recebimento_da_troca).toEqual({
      prevista: "2026-11-12",
      situacao: "previsto",
    });
    expect(bloqueios(n)).toEqual([]);
  });

  it("pagamentos que não fecham o saldo bloqueiam e mostram a diferença", () => {
    const n = vendaCompleta();
    n.pagamentos[0]!.valor_cents = 7_000_000;
    const r = retratoDaOperacao(n);
    expect(r.valores.diferenca_cents).toBe(1_000_000);
    expect(r.pendencias).toContainEqual(
      expect.objectContaining({ onde: "pagamentos", gravidade: "bloqueia" }),
    );
  });

  it("recusa troca que é o próprio veículo vendido", () => {
    const n = comTroca(vendaCompleta());
    n.troca!.chassi = ` ${n.veiculo.chassi!.toLowerCase()} `;
    expect(bloqueios(n).map((p) => p.mensagem)).toContain(
      "O veículo da troca não pode ser o mesmo veículo vendido.",
    );
  });

  it("pede só o que falta, apontando o lugar do campo", () => {
    const n = vendaCompleta();
    n.cliente = { ...n.cliente, rg: "", cep: null };
    n.veiculo = { ...n.veiculo, renavam: null };
    const campos = bloqueios(n).map((p) => `${p.onde}.${p.campo}`);
    expect(campos.sort()).toEqual(["cliente.cep", "cliente.rg", "veiculo.renavam"]);
  });

  it("veículo novo dispensa placa e Renavam", () => {
    const n = vendaCompleta();
    n.veiculo = { ...n.veiculo, condicao: "novo", placa: null, renavam: null };
    expect(bloqueios(n)).toEqual([]);
  });

  it("comprador com CNPJ vira aviso de incompatibilidade do modelo, não falta de RG", () => {
    const n = vendaCompleta();
    n.cliente = { ...n.cliente, documento: "11222333000181", rg: null, nacionalidade: null };
    const r = retratoDaOperacao(n);
    expect(r.comprador).toBe("pessoa_juridica");
    expect(bloqueios(n)).toEqual([]);
    expect(
      r.pendencias.some((p) => p.gravidade === "aviso" && /pessoa física/.test(p.mensagem)),
    ).toBe(true);
  });

  it("entrega não informada bloqueia e nunca vira evento confirmado", () => {
    const n = vendaCompleta();
    n.contrato = { ...n.contrato!, entrega_em: "" };
    const r = retratoDaOperacao(n);
    expect(r.eventos.entrega_do_vendido).toEqual({ prevista: null, situacao: "nao_informado" });
    expect(r.eventos.quitacao.situacao).toBe("nao_rastreada");
    expect(bloqueios(n).map((p) => `${p.onde}.${p.campo}`)).toEqual(["contrato.entrega_em"]);
  });

  it("negociação sem fotografia contratual bloqueia", () => {
    const n = { ...vendaCompleta(), contrato: null };
    expect(bloqueios(n).map((p) => p.onde)).toContain("contrato");
  });
});

describe("manifesto da pasta", () => {
  it("venda simples: contrato pronto, troca fora, anexos sem gerador explícitos", () => {
    const m = manifestoDaPasta(retratoDaOperacao(vendaCompleta()));
    const por = Object.fromEntries(m.itens.map((i) => [i.documento, i]));
    expect(por.contrato!.situacao).toBe("pronto");
    expect(por.termo_recebimento!.situacao).toBe("nao_se_aplica");
    expect(por.procuracao_transferencia_entrada!.situacao).toBe("nao_se_aplica");
    expect(por.nota_promissoria!.situacao).toBe("nao_se_aplica");
    expect(por.laudo_vistoria!.situacao).toBe("nao_implementado");
    expect(m.anexos_pendentes).toContain("termo_entrega");
    expect(m.anexos_pendentes).not.toContain("termo_recebimento");
    expect(m.completa).toBe(false);
  });

  it("venda com troca inclui recebimento e procuração da entrada como condicionais", () => {
    const m = manifestoDaPasta(retratoDaOperacao(comTroca(vendaCompleta())));
    const por = Object.fromEntries(m.itens.map((i) => [i.documento, i]));
    expect(por.termo_recebimento!.aplicacao).toBe("aplica");
    expect(por.procuracao_transferencia_entrada!.aplicacao).toBe("condicao_nao_registrada");
  });

  it("parcela futura à loja exige nota promissória; financiamento bancário não", () => {
    const n = vendaCompleta();
    n.pagamentos = [
      {
        forma: "promissoria",
        valor_cents: 8_000_000,
        parcelas: 4,
        primeiro_vencimento: "2026-12-10",
      },
    ];
    const por = Object.fromEntries(
      manifestoDaPasta(retratoDaOperacao(n)).itens.map((i) => [i.documento, i]),
    );
    expect(por.nota_promissoria!.aplicacao).toBe("aplica");
    expect(bloqueios(n)).toEqual([]);
  });

  it("compra direta: contrato de venda não serve e fica como modelo não implementado", () => {
    const n: Negociacao = { ...vendaCompleta(), tipo: "compra", veiculo_id: null };
    const m = manifestoDaPasta(retratoDaOperacao(n));
    const por = Object.fromEntries(m.itens.map((i) => [i.documento, i]));
    expect(por.contrato!.situacao).toBe("nao_implementado");
    expect(por.termo_entrega!.situacao).toBe("nao_se_aplica");
    expect(por.termo_recebimento!.aplicacao).toBe("aplica");
  });

  it("contrato com dados faltando fica em faltam_dados com as pendências", () => {
    const n = vendaCompleta();
    n.cliente = { ...n.cliente, rg: "" };
    const c = manifestoDaPasta(retratoDaOperacao(n)).itens[0]!;
    expect(c.situacao).toBe("faltam_dados");
    expect(c.pendencias.some((p) => p.campo === "rg")).toBe(true);
  });
});

describe("o que falta para concluir", () => {
  it("venda completa sem pendência de caixa não falta nada", () => {
    expect(faltandoParaConcluir(vendaCompleta(), [])).toEqual([]);
  });

  it("cada falta diz o setor do PDV e o campo", () => {
    const n = vendaCompleta();
    n.cliente = { ...n.cliente, profissao: "" };
    n.contrato = { ...n.contrato!, transferencia_prazo_dias: undefined, empresa: { ...n.contrato!.empresa!, cidade: "" } };
    const f = faltandoParaConcluir(n, []);
    expect(f.map((x) => `${x.setor}|${x.onde}.${x.campo}`).sort()).toEqual([
      "Comprador|cliente.profissao",
      "Entrega e transferência|contrato.transferencia_prazo_dias",
      "Loja|empresa.cidade",
    ]);
    expect(f.every((x) => x.mensagem.length > 0)).toBe(true);
  });

  it("aviso não impede concluir", () => {
    const n = vendaCompleta();
    n.contrato = { ...n.contrato!, test_drive: undefined, consulta_debitos_em: undefined };
    expect(faltandoParaConcluir(n, [])).toEqual([]);
  });

  it("órgão e UF do RG só são pedidos depois do número", () => {
    const n = vendaCompleta();
    n.cliente = { ...n.cliente, rg: "", rg_orgao_expedidor: "", rg_uf: "" };
    expect(faltandoParaConcluir(n, []).map((x) => x.campo)).toEqual(["rg"]);
    n.cliente.rg = "1234567";
    expect(faltandoParaConcluir(n, []).map((x) => x.campo).sort()).toEqual([
      "rg_orgao_expedidor",
      "rg_uf",
    ]);
  });

  it("prazos de quitação e de financiamento só são pedidos quando o bloco existe", () => {
    const n = comTroca(vendaCompleta());
    n.contrato = { ...n.contrato!, quitacao_troca_prazo_dias: undefined, financiamento_prazo_dias: undefined };
    expect(faltandoParaConcluir(n, []).map((x) => x.campo).sort()).toEqual([
      "financiamento_prazo_dias",
      "quitacao_troca_prazo_dias",
    ]);
    const simples = vendaCompleta();
    simples.contrato = { ...simples.contrato!, quitacao_troca_prazo_dias: undefined, financiamento_prazo_dias: undefined };
    expect(faltandoParaConcluir(simples, [])).toEqual([]);
  });

  it("compra pela loja só traz as pendências de caixa, com lugar", () => {
    const n: Negociacao = { ...vendaCompleta(), tipo: "compra", veiculo_id: null };
    expect(faltandoParaConcluir(n, ["Informe o nome do cliente."])).toEqual([
      { setor: "Comprador", onde: "cliente", campo: "nome", mensagem: "Informe o nome do cliente." },
    ]);
  });

  it("mensagem repetida entre retrato e caixa aparece uma vez", () => {
    const n = vendaCompleta();
    n.cliente = { ...n.cliente, nome: "" };
    const msg = bloqueios(n).find((p) => p.campo === "nome")!.mensagem;
    expect(faltandoParaConcluir(n, [msg]).filter((x) => x.mensagem === msg)).toHaveLength(1);
  });
});
