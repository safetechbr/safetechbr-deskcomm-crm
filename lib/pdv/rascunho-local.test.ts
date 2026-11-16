// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { guardarRascunho, lerRascunho, limparRascunho, temConteudo } from "./rascunho-local";

const vazio = { cliente: { nome: "" }, veiculo: { modelo: "" }, valor_cents: 0, pagamentos: [] };

describe("rascunho local do PDV", () => {
  beforeEach(() => localStorage.clear());

  it("não considera formulário vazio como conteúdo", () => {
    expect(temConteudo(vazio)).toBe(false);
    expect(temConteudo({ ...vazio, cliente: { nome: "Ana" } })).toBe(true);
    expect(temConteudo({ ...vazio, valor_cents: 100 })).toBe(true);
  });

  it("guarda, lê e limpa por usuário", () => {
    const r = { ...vazio, cliente: { nome: "Ana" } };
    guardarRascunho("u1", { aba: "venda", abertaId: null, r });
    expect(lerRascunho("u2")).toBeNull();
    expect(lerRascunho<typeof r>("u1")?.r.cliente.nome).toBe("Ana");
    limparRascunho("u1");
    expect(lerRascunho("u1")).toBeNull();
  });

  it("descarta cópia vencida ou sem conteúdo", () => {
    const antigo = {
      v: 1,
      salvoEm: new Date(Date.now() - 8 * 86_400_000).toISOString(),
      aba: "venda",
      abertaId: null,
      r: { ...vazio, cliente: { nome: "Ana" } },
    };
    localStorage.setItem("pdv:rascunho:u1", JSON.stringify(antigo));
    expect(lerRascunho("u1")).toBeNull();
    guardarRascunho("u1", { aba: "venda", abertaId: null, r: vazio });
    expect(lerRascunho("u1")).toBeNull();
  });
});
