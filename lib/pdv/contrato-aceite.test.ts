// @vitest-environment node
//
// Aceite do contrato M AUTO: 4 cenários, PDF gravado em output/contratos-teste/.
// Lê fonte e tamanho de cada trecho com o pdf.js (mesmo build legado da produção).
// Dados sintéticos.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { vendaCompleta } from "@/tests/fixtures/negociacao-documentos";

import { renderContratoPdf } from "./contrato";
import type { Negociacao } from "./regras";

type DadosDoContrato = NonNullable<Negociacao["contrato"]>;

const concluida = (n: Negociacao): Negociacao => ({
  ...n,
  status: "concluida",
  concluida_em: "2026-11-11T15:00:00.000Z",
});

function cenario(pagamentos: Negociacao["pagamentos"], contrato: Partial<DadosDoContrato>) {
  const n = concluida(vendaCompleta());
  return {
    ...n,
    pagamentos,
    contrato: { ...n.contrato!, garantia_contratual: undefined, ...contrato },
  } as Negociacao;
}

const garantia = { prazo: "3 meses", componentes: "motor e câmbio" };
const CENARIOS = [
  {
    id: 1,
    n: cenario([{ forma: "pix", valor_cents: 8_000_000, parcelas: 1, data_pagamento: "2026-11-11" }], {
      canal_venda: "presencial",
      garantia_contratual: garantia,
      usa_renave: true,
    }),
    retencao: false,
    arrependimento: false,
    garantia: true,
    renave: true,
  },
  {
    id: 2,
    n: cenario(
      [
        { forma: "pix", valor_cents: 2_000_000, parcelas: 1, data_pagamento: "2026-11-11" },
        {
          forma: "promissoria",
          valor_cents: 6_000_000,
          parcelas: 12,
          valor_parcela_cents: 500_000,
          primeiro_vencimento: "2026-12-11",
        },
      ],
      { canal_venda: "presencial", usa_renave: false },
    ),
    retencao: true,
    arrependimento: false,
    garantia: false,
    renave: false,
  },
  {
    id: 3,
    n: cenario(
      [
        { forma: "pix", valor_cents: 2_000_000, parcelas: 1, data_pagamento: "2026-11-11" },
        { forma: "financiamento", banco: "Banco Exemplo", valor_cents: 6_000_000, parcelas: 36 },
      ],
      { canal_venda: "fora_do_estabelecimento", garantia_contratual: garantia, usa_renave: true },
    ),
    retencao: true,
    arrependimento: true,
    garantia: true,
    renave: true,
  },
  {
    id: 4,
    n: cenario(
      [{ forma: "dinheiro", valor_cents: 8_000_000, parcelas: 1, data_pagamento: "2026-11-11" }],
      { canal_venda: "fora_do_estabelecimento", usa_renave: false },
    ),
    retencao: false,
    arrependimento: true,
    garantia: false,
    renave: false,
  },
];

type Trecho = { str: string; tamanho: number; y: number; negrito: boolean };

async function lerPdf(buf: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // fontExtraProperties expõe o nome real da fonte (Helvetica-Bold) em commonObjs.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), fontExtraProperties: true })
    .promise;
  const trechos: Trecho[] = [];
  const paginas: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    await page.getOperatorList(); // carrega as fontes em commonObjs
    const content = await page.getTextContent();
    const linhas: string[] = [];
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const fonte = page.commonObjs.get(it.fontName) as { name?: string } | undefined;
      trechos.push({
        str: it.str,
        tamanho: Math.hypot(it.transform[0], it.transform[1]),
        y: it.transform[5],
        negrito: /Bold/i.test(fonte?.name ?? ""),
      });
      linhas.push(it.str);
    }
    paginas.push(linhas.join(" ").replace(/\s+/g, " "));
  }
  return { trechos, paginas, texto: paginas.join(" ") };
}

const ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const ALTURA_DO_RODAPE = 60; // rodapé fixo fica em bottom: 26 (pontos, origem embaixo)

describe.each(CENARIOS)("aceite do contrato: cenário $id", (c) => {
  it("cumpre a especificação", async () => {
    const buf = await renderContratoPdf({
      negociacao: c.n,
      loja: { razaoSocial: "x", nomeFantasia: "x", cnpj: null, logoUrl: null, cidade: null },
      vendedorNome: null,
    });
    const pasta = join(process.cwd(), "output/contratos-teste");
    mkdirSync(pasta, { recursive: true });
    writeFileSync(join(pasta, `cenario-${c.id}.pdf`), buf);

    const { trechos, paginas, texto } = await lerPdf(buf);

    // 1. Nada abaixo de 12pt fora do rodapé.
    const pequenos = trechos.filter((t) => t.y > ALTURA_DO_RODAPE && t.tamanho < 11.95);
    expect(pequenos.map((t) => `${t.str} (${t.tamanho.toFixed(1)})`)).toEqual([]);

    // 2. Cláusulas limitativas em negrito.
    const limitativas = [
      "Não é vício o desgaste natural",
      "As taxas de transferência serão pagas",
      "A partir da entrega, o COMPRADOR responde",
      ...(c.retencao ? ["Resolvido o contrato por culpa do COMPRADOR"] : []),
    ];
    for (const inicio of limitativas) {
      const t = trechos.find((x) => x.str.startsWith(inicio));
      expect(t, inicio).toBeDefined();
      expect(t!.negrito, inicio).toBe(true);
    }

    // 3. Anexos: numeração I..n sem lacuna, cada um em página própria, todo citado existe.
    const cabecalhos = paginas
      .map((p) => /^(?:.*?\s)?ANEXO ([IVX]+)\s/.exec(p)?.[1])
      .filter((x): x is string => !!x);
    expect(cabecalhos).toEqual(ROMANOS.slice(0, cabecalhos.length));
    const citados = new Set([...texto.matchAll(/\bAnexo ([IVX]+)\b/g)].map((m) => m[1]));
    for (const r of citados) expect(cabecalhos, `Anexo ${r}`).toContain(r);

    // 4. Blocos condicionais.
    expect(texto.includes("podendo reter somente")).toBe(c.retencao);
    expect(texto.includes("desistir do contrato em até 7 (sete) dias")).toBe(c.arrependimento);
    expect(texto.includes("garantia contratual (art. 50")).toBe(c.garantia);
    expect(texto.includes("TERMO DE GARANTIA")).toBe(c.garantia);
    expect(texto.includes("registrada no RENAVE")).toBe(c.renave);
    expect(texto.includes("emitirá a ATPV-e")).toBe(!c.renave);

    // 4b. Campos do ato saem preenchidos nos anexos.
    expect(texto).toContain("10.000 km");
    expect(texto).toContain("chaves (2 unidades)");
    expect(texto).toContain("Lataria e pintura: sem avarias");
    expect(texto).toContain("CNH nº: 01234567890");

    // 5. Formais.
    expect(texto).not.toMatch(/VENDEDOR /);
    expect(texto).not.toMatch(/regulamentação/i);

    // 6. Cláusulas numeradas em sequência.
    const numeros = [...texto.matchAll(/Cláusula (\d+)ª:/g)].map((m) => Number(m[1]));
    expect(numeros).toEqual(numeros.map((_, i) => i + 1));
    expect(numeros.length).toBeGreaterThan(5);
  });
});
