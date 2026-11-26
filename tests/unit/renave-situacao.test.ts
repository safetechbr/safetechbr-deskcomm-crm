import { describe, expect, it, vi } from "vitest";

// A rota do cron importa clientes de servidor no topo; aqui só interessa a regra pura.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/auth/cron-auth", () => ({ autorizaCron: vi.fn() }));
vi.mock("@/lib/organizacao/operante", () => ({ idsDeOrgsParadas: vi.fn() }));

import { precisaNovaConsulta } from "@/app/api/v1/cron/renave-status/route";
import { pendenteNoRenave } from "@/lib/renave/situacao";

const sem = { situacao: null, documentos: null, ultimo_erro: null };

describe("pendenteNoRenave", () => {
  it("carro em estoque sem RENAVE ou sem entrada confirmada é pendente", () => {
    expect(pendenteNoRenave(undefined, "disponivel")).toBe(true);
    expect(pendenteNoRenave({ ...sem, situacao: "S" }, "disponivel")).toBe(true);
    expect(pendenteNoRenave({ ...sem, situacao: "C" }, "disponivel")).toBe(false);
  });
  it("carro vendido só sai da pendência com saída registrada", () => {
    expect(pendenteNoRenave({ ...sem, situacao: "C" }, "vendido")).toBe(true);
    for (const s of ["V", "E", "I"]) expect(pendenteNoRenave({ ...sem, situacao: s }, "vendido")).toBe(false);
  });
  it("erro no último envio sempre é pendência", () => {
    expect(pendenteNoRenave({ ...sem, situacao: "C", ultimo_erro: "falhou" }, "disponivel")).toBe(true);
  });
});

describe("precisaNovaConsulta", () => {
  const agora = Date.parse("2026-11-25T12:00:00Z");
  const dias = (n: number) => new Date(agora - n * 24 * 60 * 60_000).toISOString();

  it("consulta enquanto solicitado ou no Detran", () => {
    expect(precisaNovaConsulta(null, {}, null, agora)).toBe(true);
    expect(precisaNovaConsulta("S", {}, null, agora)).toBe(true);
    expect(precisaNovaConsulta("T", {}, null, agora)).toBe(true);
  });
  it("para quando confirmado e sem documento pendente de baixa", () => {
    expect(precisaNovaConsulta("C", {}, null, agora)).toBe(false);
    expect(precisaNovaConsulta("C", { crlve: { disponivel: true, arquivos: [{}] } }, null, agora)).toBe(false);
  });
  it("consulta se há documento disponível ainda não baixado", () => {
    expect(precisaNovaConsulta("C", { crlve: { disponivel: true, arquivos: [] } }, null, agora)).toBe(true);
  });
  it("saída recente sem ATPV-e de saída continua consultando; antiga para", () => {
    expect(precisaNovaConsulta("V", {}, dias(2), agora)).toBe(true);
    expect(precisaNovaConsulta("V", { atpve_saida: { disponivel: true, arquivos: [{}] } }, dias(2), agora)).toBe(false);
    expect(precisaNovaConsulta("V", {}, dias(8), agora)).toBe(false);
  });
});
