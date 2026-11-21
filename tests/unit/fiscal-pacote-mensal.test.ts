import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import { gerarPacoteMensal } from "@/lib/fiscal/pacote-mensal";

vi.mock("@/lib/fiscal/config-servidor", () => ({ carregarConfigComContexto: async () => ({ ctx: null }) }));

const enc = (s: string) => new TextEncoder().encode(s);

function fakeAdmin(docs: Record<string, unknown>[], eventos: Record<string, unknown>[], storage: Record<string, Uint8Array>, primeiraVazia = false) {
  let chamadas = 0;
  const subidos: Record<string, Uint8Array> = {};
  const consulta = (data: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "gte", "lt", "order", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data });
    q.then = (r: (v: unknown) => unknown) => r({ data });
    return q;
  };
  const admin = {
    from: (t: string) => {
      if (t === "config_fiscal_loja") return consulta({ email_contador: null, razao_social: "Loja" });
      if (t === "documentos_fiscais") return consulta(primeiraVazia && chamadas++ === 0 ? [] : docs);
      if (t === "documento_fiscal_eventos") return consulta(eventos);
      if (t === "veiculos") return consulta([{ id: "v1", chassi: "CH1", custo_cents: 5000 }]);
      return { upsert: async () => ({ error: null }) };
    },
    storage: {
      from: () => ({
        download: async (p: string) => ({ data: storage[p] ? { arrayBuffer: async () => storage[p]!.buffer } : null }),
        upload: async (p: string, b: Uint8Array) => {
          subidos[p] = b;
          return { error: null };
        },
      }),
    },
  };
  return { admin: admin as never, subidos };
}

describe("pacote mensal do contador", () => {
  it("inclui nota cancelada, o XML do evento e a coluna de situação", async () => {
    const docs = [
      { id: "d1", operacao: "SAI_VENDA", numero: 1, chave: "K1", status: "autorizada", ref_provider: "r1", valor_total_cents: 10000, veiculo_id: "v1", xml_storage_path: "o/d1.xml" },
      { id: "d2", operacao: "SAI_VENDA", numero: 2, chave: "K2", status: "cancelada", ref_provider: "r2", valor_total_cents: 9000, veiculo_id: "v1", xml_storage_path: "o/d2.xml" },
    ];
    const { admin, subidos } = fakeAdmin(docs, [], { "o/d1.xml": enc("<a/>"), "o/d2.xml": enc("<b/>"), "o/d2-cancelamento.xml": enc("<ev/>") });
    const r = await gerarPacoteMensal(admin, "o", "2026-11", { enviar: false });
    expect(r).toMatchObject({ ok: true, qtdNotas: 2 });
    const zip = unzipSync(subidos["o/pacotes/2026-11.zip"]!);
    expect(strFromU8(zip["xml/K2.xml"]!)).toBe("<b/>");
    expect(strFromU8(zip["xml/eventos/cancelamento-K2.xml"]!)).toBe("<ev/>");
    const csv = strFromU8(zip["margem-por-chassi.csv"]!);
    expect(csv).toContain("numero;operacao;situacao;");
    expect(csv).toContain("1;SAI_VENDA;autorizada;");
    // cancelada não conta margem (último campo vazio)
    expect(csv).toMatch(/2;SAI_VENDA;cancelada;.*;90,00;;\r?\n/);
  });

  it("inclui nota de mês anterior cancelada neste mês", async () => {
    // 1ª consulta (autorizadas no mês) vem vazia: d3 só entra pelo evento de cancelamento
    const docs = [{ id: "d3", operacao: "SAI_VENDA", numero: 3, chave: "K3", status: "cancelada", ref_provider: "r3", valor_total_cents: 8000, veiculo_id: "v1", xml_storage_path: "o/d3.xml" }];
    const { admin, subidos } = fakeAdmin(docs, [{ documento_id: "d3" }], { "o/d3.xml": enc("<c/>"), "o/d3-cancelamento.xml": enc("<ev3/>") }, true);
    const r = await gerarPacoteMensal(admin, "o", "2026-12", { enviar: false });
    expect(r).toMatchObject({ ok: true, qtdNotas: 1 });
    const zip = unzipSync(subidos["o/pacotes/2026-12.zip"]!);
    expect(strFromU8(zip["xml/eventos/cancelamento-K3.xml"]!)).toBe("<ev3/>");
  });
});
