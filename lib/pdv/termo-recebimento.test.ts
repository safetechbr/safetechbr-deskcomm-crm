// @vitest-environment node
import { describe, expect, it } from "vitest";

import { extractPdfText } from "@/lib/ai/rag/extractors/pdf";
import { comTroca, vendaCompleta } from "@/tests/fixtures/negociacao-documentos";

import { renderContratoPdf } from "./contrato";
import { manifestoDaPasta } from "./manifesto-da-pasta";
import type { Negociacao } from "./regras";
import { retratoDaOperacao } from "./retrato-da-operacao";
import { DECLARACOES_DO_CLIENTE, faltasDoTermoDeRecebimento, type TermoDeRecebimento } from "./termo-recebimento";

const doTermo = (n: Negociacao) =>
  manifestoDaPasta(retratoDaOperacao(n)).itens.find((i) => i.documento === "termo_recebimento")!;
const pdf = async (n: Negociacao) =>
  (
    await extractPdfText(
      await renderContratoPdf({
        negociacao: n,
        loja: { razaoSocial: "x", nomeFantasia: "x", cnpj: null, logoUrl: null, cidade: null },
        vendedorNome: null,
      }),
    )
  ).replace(/\s+/g, " ");

const completo: TermoDeRecebimento = {
  combustivel: "3/4",
  funcionario: { nome: "Funcionário de Teste", cpf: "" },
  itens: { chave_principal: { recebido: true, obs: "" }, manual_proprietario: { recebido: false, obs: "perdido" } },
  declaracoes: Object.fromEntries(
    DECLARACOES_DO_CLIENTE.map(([k]) => [k, { resposta: k === "dono_legitimo" || k === "km_real", detalhe: "" }]),
  ),
  debitos: { consulta_em: "2026-11-12", ipva: "quitado", pagos_por: "cliente" },
};

function comRecebimento(n: Negociacao): Negociacao {
  return {
    ...n,
    contrato: {
      ...n.contrato!,
      recebimento_troca_hora: "10:30",
      recebimento_troca_km: 55100,
      termo_recebimento: completo,
    },
  };
}

describe("termo de recebimento do veículo em pagamento", () => {
  it("vazio pede hora, km, combustível, itens e as 8 respostas; terceiro sem CPF pede o CPF", () => {
    const campos = faltasDoTermoDeRecebimento({}).map((f) => f.campo);
    expect(campos.slice(0, 4)).toEqual([
      "recebimento_troca_hora",
      "recebimento_troca_km",
      "termo_recebimento.combustivel",
      "termo_recebimento.itens",
    ]);
    expect(campos.filter((c) => c.startsWith("termo_recebimento.declaracoes."))).toHaveLength(8);
    const ato = { hora: "10:30", km: 1 };
    expect(faltasDoTermoDeRecebimento(completo, ato)).toEqual([]);
    expect(
      faltasDoTermoDeRecebimento({ ...completo, entregue_por: { nome: "Terceiro" } }, ato).map((f) => f.campo),
    ).toEqual(["termo_recebimento.entregue_por.cpf"]);
  });

  it("manifesto: aguarda o recebimento; preenchido fica pronto; sem troca não se aplica", () => {
    expect(doTermo(comTroca(vendaCompleta())).situacao).toBe("aguarda_evento");
    expect(doTermo(comRecebimento(comTroca(vendaCompleta()))).situacao).toBe("pronto");
    expect(doTermo(vendaCompleta()).situacao).toBe("nao_se_aplica");
    expect(retratoDaOperacao(vendaCompleta()).termo_recebimento).toBeUndefined();
  });

  it("PDF traz recebimento, declarações do cliente, débitos e cláusulas", async () => {
    const t = await pdf(comRecebimento(comTroca(vendaCompleta())));
    expect(t).toContain("1. Do recebimento");
    expect(t).toContain("Nível de combustível: 3/4");
    expect(t).toContain("Recebido por (VENDEDORA): Funcionário de Teste");
    expect(t).toContain("Manual do proprietário Não perdido");
    expect(t).toContain("2. Declarações do COMPRADOR sobre o veículo");
    expect(t).toContain("3. Consulta de débitos");
    expect(t).toContain("Data da consulta: 12/11/2026");
    expect(t).toContain("4. Das declarações");
    expect(t).toContain("arts. 441 a 446 do Código Civil");
    expect(t).toContain("o COMPRADOR paga em até 10 (dez) dias da comunicação");
    expect(t).toContain("COMPRADOR, antes da transferência");
    expect(t).toContain("Resolução CONTRAN 809/2020");
    expect(t).toContain("A ATPV-e só será emitida depois da baixa do gravame");
    // o corpo do contrato ainda usa "troca"; o anexo, não
    const inicio = t.indexOf("ANEXO III");
    const fim = t.indexOf("ANEXO", inicio + 1);
    const anexo = t.slice(inicio, fim < 0 ? undefined : fim).replace("Modelo da troca", "");
    expect(anexo).toContain("1. Do recebimento");
    expect(anexo).not.toMatch(/\btroca\b/i);
  });

  it("sem quitação, o parágrafo do gravame sai do termo", async () => {
    const t = await pdf(comRecebimento(comTroca(vendaCompleta(), 0)));
    expect(t).toContain("4. Das declarações");
    expect(t).not.toContain("A ATPV-e só será emitida depois da baixa do gravame");
  });
});
