// @vitest-environment node
import { describe, expect, it } from "vitest";

import { extractPdfText } from "@/lib/ai/rag/extractors/pdf";
import { comTermoEntrega, comVistoria, vendaCompleta } from "@/tests/fixtures/negociacao-documentos";

import { renderContratoPdf } from "./contrato";
import { manifestoDaPasta } from "./manifesto-da-pasta";
import type { Negociacao } from "./regras";
import { retratoDaOperacao } from "./retrato-da-operacao";
import { faltasDoTermoDeEntrega } from "./termo-entrega";
import { decidirVersaoDoContrato } from "./versao-do-contrato";

const campos = (n: Negociacao) => faltasDoTermoDeEntrega(n.contrato!.termo_entrega ?? {}).map((f) => f.campo);
const doTermo = (n: Negociacao) =>
  manifestoDaPasta(retratoDaOperacao(n)).itens.find((i) => i.documento === "termo_entrega")!;
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

describe("termo de entrega", () => {
  it("vazio pede combustível e itens; terceiro sem CPF pede o CPF", () => {
    expect(campos(vendaCompleta())).toEqual(["termo_entrega.combustivel", "termo_entrega.itens"]);
    const n = comTermoEntrega(vendaCompleta());
    expect(campos(n)).toEqual([]);
    n.contrato!.termo_entrega!.retirada_por = { nome: "Terceiro" };
    expect(campos(n)).toEqual(["termo_entrega.retirada_por.cpf"]);
  });

  it("manifesto: aguarda a entrega sem fazer minuta; preenchido fica pronto", () => {
    const vazio = vendaCompleta();
    expect(doTermo(vazio).situacao).toBe("aguarda_evento");
    const versao = decidirVersaoDoContrato(vazio);
    expect(versao.avisos.map((a) => a.campo)).not.toContain("termo_entrega.combustivel");
    expect(versao.versao).toBe(decidirVersaoDoContrato(comTermoEntrega(vendaCompleta())).versao);
    expect(doTermo(comTermoEntrega(vendaCompleta())).situacao).toBe("pronto");
  });

  it("compra pela loja não tem termo de entrega", () => {
    const n: Negociacao = { ...vendaCompleta(), tipo: "compra", veiculo_id: null };
    expect(doTermo(n).situacao).toBe("nao_se_aplica");
    expect(retratoDaOperacao(n).termo_entrega).toBeUndefined();
  });

  it("PDF traz checklist, combustível, km do laudo e declarações", async () => {
    const t = await pdf(comTermoEntrega(comVistoria(vendaCompleta())));
    expect(t).toContain("Nível de combustível: 1/2");
    expect(t).toContain("Entregue por (VENDEDORA): Funcionário de Teste");
    expect(t).toContain("Manual do proprietário Não não veio de fábrica");
    expect(t).toContain("Quilometragem na entrega: 10.000 km");
    expect(t).toContain("2. Das declarações");
    expect(t).toMatch(/garantia da Cláusula \d+ª/);
    expect(t).not.toContain("Retirado por terceiro");
  }, 30_000);
});
