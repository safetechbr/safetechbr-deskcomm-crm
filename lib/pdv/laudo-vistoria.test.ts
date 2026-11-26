// @vitest-environment node
import { describe, expect, it } from "vitest";

import { extractPdfText } from "@/lib/ai/rag/extractors/pdf";
import { comVistoria, vendaCompleta } from "@/tests/fixtures/negociacao-documentos";

import { clausulasFixas } from "./clausulas-fixas";
import { renderContratoPdf } from "./contrato";
import { avariasDoLaudo, faltasDaVistoria, type Vistoria } from "./laudo-vistoria";
import type { Negociacao } from "./regras";
import { retratoDaOperacao } from "./retrato-da-operacao";

const vistoria = (): Vistoria => structuredClone(comVistoria(vendaCompleta()).contrato!.vistoria!);
const campos = (v: Vistoria, entregaKm?: number) =>
  faltasDaVistoria(v, { temRepresentante: true, entregaKm }).map((f) => f.campo);

describe("laudo de vistoria", () => {
  it("completo não tem faltas; sem representante pede o vistoriador", () => {
    expect(campos(vistoria())).toEqual([]);
    expect(faltasDaVistoria(vistoria(), { temRepresentante: false }).map((f) => f.campo)).toEqual([
      "vistoria.vistoriador",
    ]);
  });

  it("chassi divergente ou remarcação bloqueiam (CP art. 311)", () => {
    const v = vistoria();
    v.identificacao!.chassi = "divergente";
    expect(campos(v)).toContain("vistoria.identificacao");
    const w = vistoria();
    w.identificacao!.remarcacao = "sim";
    expect(campos(w)).toContain("vistoria.identificacao");
    const p = vistoria();
    p.identificacao!.placa = "divergente";
    expect(campos(p)).not.toContain("vistoria.identificacao");
  });

  it("NV pede justificativa, A pede descrição e sulco baixo força A", () => {
    const v = vistoria();
    v.itens!.ar = { estado: "NV" };
    v.itens!.lataria = { estado: "A" };
    v.sulco_mm = 1.2;
    expect(campos(v)).toEqual([
      "vistoria.itens.lataria",
      "vistoria.itens.ar",
      "vistoria.itens.pneus",
    ]);
    v.itens!.ar.justificativa = "sem bateria";
    v.itens!.lataria.obs = "risco na porta";
    v.itens!.pneus = { estado: "A", obs: "sulco 1,2 mm" };
    expect(campos(v)).toEqual([]);
  });

  it("km da vistoria diferente da entrega bloqueia", () => {
    expect(campos(vistoria(), 10000)).toEqual([]);
    expect(campos(vistoria(), 10050)).toEqual(["vistoria.km"]);
  });

  it("avarias reúnem itens A, avulsas e apontamentos da cautelar", () => {
    const v = vistoria();
    v.itens!.lataria = { estado: "A", obs: "risco na porta" };
    v.avarias = [{ descricao: "Friso solto", loja_repara: true }];
    v.cautelar = { apontamentos: "repintura no capô" };
    expect(avariasDoLaudo(v)).toEqual([
      { descricao: "Lataria e pintura: risco na porta", loja_repara: false },
      { descricao: "Friso solto", loja_repara: true },
      { descricao: "Apontado no laudo cautelar: repintura no capô", loja_repara: false },
    ]);
  });

  it("venda com laudo completo não tem bloqueios; laudo vazio bloqueia", () => {
    const n = comVistoria(vendaCompleta());
    const bloqueios = (x: Negociacao) =>
      retratoDaOperacao(x).pendencias.filter((p) => p.gravidade === "bloqueia");
    expect(bloqueios(n)).toEqual([]);
    n.contrato!.vistoria = {};
    expect(bloqueios(n).map((p) => p.campo)).toContain("vistoria.data");
  });

  it("cláusulas: anexo renomeado, garantia citada e ciência da cautelar reprovada", () => {
    const n = comVistoria(vendaCompleta());
    n.contrato!.vistoria!.cautelar = {
      empresa: "Cautelar X",
      numero: "123",
      resultado: "reprovado",
    };
    n.contrato!.vistoria!.avarias = [{ descricao: "Friso solto", loja_repara: true }];
    const f = clausulasFixas(n, retratoDaOperacao(n).blocos);
    expect(f.anexos.find((a) => a.chave === "estado_veiculo")?.nome).toBe(
      "Laudo de vistoria e estado do veículo",
    );
    const laudo = JSON.stringify(f.laudo);
    expect(laudo).toMatch(/Cláusula \d+ª/);
    expect(laudo).toContain("art. 26");
    expect(laudo).toContain("REPROVADO");
    expect(laudo).toContain("arts. 30 e 35");
    const legado = clausulasFixas(vendaCompleta(), retratoDaOperacao(vendaCompleta()).blocos);
    expect(legado.laudo).toBeUndefined();
  });

  it("PDF traz o laudo como Anexo I", async () => {
    const n = comVistoria(vendaCompleta());
    n.contrato!.vistoria!.itens!.lataria = { estado: "A", obs: "risco na porta" };
    const buf = await renderContratoPdf({
      negociacao: n,
      loja: { razaoSocial: "x", nomeFantasia: "x", cnpj: null, logoUrl: null, cidade: null },
      vendedorNome: null,
    });
    const t = (await extractPdfText(buf)).replace(/\s+/g, " ");
    expect(t).toContain("Laudo de vistoria e estado do veículo");
    expect(t).toContain("Lataria e pintura: risco na porta");
    expect(t).toContain("art. 26");
  }, 30_000);
});
