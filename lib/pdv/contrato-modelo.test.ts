// @vitest-environment node
//
// Ambiente `node` para ler o texto do PDF com o mesmo extrator da produção
// (ver lib/propostas/documento/pdf-do-documento.test.ts). Dados sintéticos.
import { describe, expect, it } from "vitest";

import { extractPdfText } from "@/lib/ai/rag/extractors/pdf";
import { comTroca, vendaCompleta } from "@/tests/fixtures/negociacao-documentos";

import { renderContratoPdf } from "./contrato";
import type { Negociacao } from "./regras";
import { decidirVersaoDoContrato } from "./versao-do-contrato";

const concluida = (n: Negociacao): Negociacao => ({
  ...n,
  status: "concluida",
  concluida_em: "2026-11-11T15:00:00.000Z",
});

async function texto(n: Negociacao): Promise<string> {
  const buf = await renderContratoPdf({
    negociacao: n,
    loja: { razaoSocial: "x", nomeFantasia: "x", cnpj: null, logoUrl: null, cidade: null },
    vendedorNome: null,
  });
  return (await extractPdfText(buf)).replace(/\s+/g, " ");
}

describe("versão do contrato", () => {
  it("concluída e completa sai para assinatura", () => {
    const d = decidirVersaoDoContrato(concluida(vendaCompleta()));
    expect(d.versao).toBe("assinatura");
    expect(d.motivos).toEqual([]);
    expect(d.anexos_pendentes).toContain("termo_entrega");
  });

  it("em aberto é minuta, mesmo com dados completos", () => {
    expect(decidirVersaoDoContrato(vendaCompleta()).motivos).toEqual(["Negociação em aberto."]);
  });

  it("concluída com dado obrigatório faltando volta a ser minuta", () => {
    const n = concluida(vendaCompleta());
    n.cliente = { ...n.cliente, rg: "" };
    const d = decidirVersaoDoContrato(n);
    expect(d.versao).toBe("minuta");
    expect(d.bloqueios.map((p) => p.campo)).toEqual(["rg"]);
  });

  it("compra pela loja é sempre minuta: falta o contrato de aquisição", () => {
    const n: Negociacao = { ...concluida(vendaCompleta()), tipo: "compra", veiculo_id: null };
    expect(decidirVersaoDoContrato(n).versao).toBe("minuta");
  });
});

describe("PDF do contrato", () => {
  it("venda simples omite todos os blocos de troca e o desconto zerado", async () => {
    const n = concluida(vendaCompleta());
    n.contrato = { ...n.contrato!, clausula_especial: "" };
    const t = await texto(n);
    expect(t).not.toMatch(/troca/i);
    expect(t).not.toContain("Desconto");
    expect(t).not.toContain("MINUTA");
    expect(t).not.toContain("Pendências desta minuta");
    expect(t).toContain("oitenta mil reais");
    expect(t).toContain("Data prevista de entrega");
    // Cláusula especial vazia não vira linha em branco na versão de assinatura.
    expect(t).not.toContain("Cláusula Especial");
  }, 30_000);

  it("venda com troca inclui só os blocos aplicáveis", async () => {
    const n = concluida({ ...comTroca(vendaCompleta(), 0), desconto_cents: 100_000 });
    n.troca!.regularizacao = [];
    n.pagamentos[1]!.valor_cents = 0;
    n.pagamentos = [{ ...n.pagamentos[0]!, valor_cents: 5_900_000 }];
    expect(decidirVersaoDoContrato(n).bloqueios).toEqual([]);
    const t = await texto(n);
    expect(t).toContain("Veículo recebido na troca");
    expect(t).toContain("Data prevista de recebimento da troca");
    expect(t).toContain("Desconto");
    // Sem quitação assumida pela loja, a linha de quitação não aparece.
    expect(t).not.toContain("Quitação da troca");
    expect(t).toContain("Total: R$ 79.000,00 (setenta e nove mil reais)");
  }, 30_000);

  it("minuta mostra o que falta e os documentos ainda sem emissão", async () => {
    const n = vendaCompleta();
    n.cliente = { ...n.cliente, rg: "" };
    const t = await texto(n);
    expect(t).toContain("MINUTA");
    expect(t).toContain("Pendências desta minuta");
    expect(t).toContain("Cliente: Informe");
    expect(t).toContain("Termo de entrega (Anexo II)");
    expect(t).not.toContain("Termo de recebimento (Anexo III)");
  }, 30_000);

  it("comprador pessoa jurídica é qualificado por CNPJ, sem RG", async () => {
    const n = concluida(vendaCompleta());
    n.cliente = { ...n.cliente, documento: "11222333000181", rg: null, nacionalidade: null };
    const t = await texto(n);
    expect(t).toContain("CNPJ 11.222.333/0001-81");
    expect(t).not.toMatch(/RG _/);
  }, 30_000);

  it("cláusulas fixas: CDC 49 só fora do estabelecimento, garantia contratual opcional", async () => {
    const n = concluida(vendaCompleta());
    const sem = await texto(n);
    expect(sem).toContain("Lei 13.111/2015");
    expect(sem).toContain("art. 101, I");
    expect(sem).not.toContain("art. 49");
    expect(sem).not.toContain("garantia contratual");
    expect(sem).not.toContain("Não liberado o financiamento");
    n.contrato = {
      ...n.contrato!,
      venda_fora_do_estabelecimento: true,
      garantia_contratual: { prazo: "3 meses", componentes: "motor e câmbio" },
    };
    const com = await texto(n);
    expect(com).toContain("art. 49");
    expect(com).toMatch(/garantia contratual \(art\. 50.*3 meses, cobrindo motor e câmbio/);
  }, 30_000);

  it("financiamento traz a cláusula de liberação e o gravame na transferência", async () => {
    const n = concluida(comTroca(vendaCompleta()));
    const t = await texto(n);
    expect(t).toContain("Não liberado o financiamento em 10 (dez) dias");
    expect(t).toContain("gravame da instituição financeira (Banco Exemplo)");
    expect(t).toContain("VEÍCULO EM PAGAMENTO");
    expect(t).toContain("junto a Banco Credor Exemplo");
    expect(t).toContain("Anexo V");
  }, 30_000);

  it("assinatura traz o representante da loja e as testemunhas", async () => {
    const n = concluida(vendaCompleta());
    n.contrato = {
      ...n.contrato!,
      representante_cargo: "sócio-administrador",
      testemunhas: [{ nome: "Testemunha Exemplo", cpf: "52998224725" }],
    };
    const t = await texto(n);
    expect(t).toContain("p/ Representante Exemplo, sócio-administrador");
    expect(t).toContain("Nome: Testemunha Exemplo");
    expect(t).toContain("CPF: 529.982.247-25");
    expect(t).toContain("Testemunha 2");
  }, 30_000);
});

