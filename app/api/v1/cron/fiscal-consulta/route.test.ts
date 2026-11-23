import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ consultar: vi.fn() }));

vi.mock("@/lib/env", () => ({ env: { INTERNAL_SECRET: "segredo", INTERNAL_CRON_SECRET: "" } }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/organizacao/operante", () => ({ idsDeOrgsParadas: vi.fn(async () => []) }));
vi.mock("@/lib/fiscal/config-servidor", () => ({
  carregarConfigComContexto: vi.fn(async () => ({ ctx: { cnpj: "1", ambiente: "homologacao", token: "t" } })),
}));
vi.mock("@/lib/fiscal/aplicar-resultado", () => ({ aplicarResultado: vi.fn(async () => true) }));
vi.mock("@/lib/fiscal/focus/provider", async () => {
  const real = await vi.importActual<typeof import("@/lib/fiscal/focus/provider")>("@/lib/fiscal/focus/provider");
  return { ...real, FocusNfeProvider: class { consultarNfe = h.consultar; } };
});

import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { idsDeOrgsParadas } from "@/lib/organizacao/operante";
import { NotaNaoEncontradaNoProvedor } from "@/lib/fiscal/focus/provider";
import { GET } from "./route";

type Update = { patch: Record<string, unknown>; eqs: [string, unknown][] };

function fakeAdmin(pendentes: Record<string, unknown>[]) {
  const updates: Update[] = [];
  const admin = {
    from: () => ({
      select: () => {
        const c = { eq: () => c, lt: () => c, order: () => c, limit: async () => ({ data: pendentes, error: null }) };
        return c;
      },
      update: (patch: Record<string, unknown>) => {
        const u: Update = { patch, eqs: [] };
        updates.push(u);
        const c = {
          eq: (k: string, v: unknown) => { u.eqs.push([k, v]); return c; },
          then: (r: (x: unknown) => unknown) => Promise.resolve({ error: null }).then(r),
        };
        return c;
      },
    }),
  };
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
  return updates;
}

const req = (auth = "Bearer segredo") =>
  new NextRequest("http://x/api/v1/cron/fiscal-consulta", { headers: { Authorization: auth } });
const velha = () => new Date(Date.now() - 30 * 60_000).toISOString();
const recente = () => new Date(Date.now() - 2 * 60_000).toISOString();
const nota = (o: Record<string, unknown> = {}) =>
  ({ id: "d1", organization_id: "o1", status: "processando", rascunho: {}, ref_provider: "r1", updated_at: velha(), ...o });
const corpo = async (res: Response) => (await res.json()).data as Record<string, number>;

describe("cron fiscal-consulta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(idsDeOrgsParadas).mockResolvedValue([]);
  });

  it("nota sem ref vira rejeitada e audita", async () => {
    const ups = fakeAdmin([nota({ ref_provider: null })]);
    const d = await corpo(await GET(req()));
    expect(ups).toHaveLength(1);
    expect(ups[0]!.patch.status).toBe("rejeitada");
    expect(ups[0]!.eqs).toContainEqual(["status", "processando"]);
    expect(vi.mocked(audit).mock.calls[0]![0].metadata).toMatchObject({ motivo: "nao_chegou_ao_provedor" });
    expect(d).toMatchObject({ consultadas: 0, atualizadas: 1, falhas: 0 });
  });

  it("404 em nota velha vira rejeitada", async () => {
    h.consultar.mockRejectedValue(new NotaNaoEncontradaNoProvedor("não encontrada"));
    const ups = fakeAdmin([nota()]);
    const d = await corpo(await GET(req()));
    expect(ups[0]!.patch.status).toBe("rejeitada");
    expect(d).toMatchObject({ atualizadas: 1, falhas: 0 });
  });

  it("404 recente não mexe na nota", async () => {
    h.consultar.mockRejectedValue(new NotaNaoEncontradaNoProvedor("não encontrada"));
    const ups = fakeAdmin([nota({ updated_at: recente() })]);
    const d = await corpo(await GET(req()));
    expect(ups).toHaveLength(0);
    expect(d.falhas).toBe(1);
  });

  it("org parada só adia, sem audit", async () => {
    vi.mocked(idsDeOrgsParadas).mockResolvedValue(["o1"]);
    const ups = fakeAdmin([nota()]);
    await GET(req());
    expect(Object.keys(ups[0]!.patch)).toEqual(["updated_at"]);
    expect(audit).not.toHaveBeenCalled();
    expect(h.consultar).not.toHaveBeenCalled();
  });

  it("erro genérico adia a nota e conta falha", async () => {
    h.consultar.mockRejectedValue(new Error("timeout"));
    const ups = fakeAdmin([nota()]);
    const d = await corpo(await GET(req()));
    expect(Object.keys(ups[0]!.patch)).toEqual(["updated_at"]);
    expect(d).toMatchObject({ consultadas: 1, atualizadas: 0, falhas: 1 });
  });

  it("sem segredo devolve 403", async () => {
    fakeAdmin([]);
    expect((await GET(req("Bearer errado"))).status).toBe(403);
  });
});
