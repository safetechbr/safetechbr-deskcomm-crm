import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  env: { TENANT_PROVISIONING_SECRET: "" },
  limite: vi.fn(),
  espiar: vi.fn(),
  decide: vi.fn(),
  registra: vi.fn(),
  sessao: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: h.env }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({
  checkRateLimit: h.limite,
  peekRateLimit: h.espiar,
}));
vi.mock("@/lib/agent-engine/pacing/ledger-supabase", () => ({
  criarPacingDoCanal: async () => ({ decide: h.decide, registraEnvio: h.registra }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: h.sessao }) }) }),
  }),
}));

const { POST } = await import("./route");

const SEGREDO = "s".repeat(40);

function pedido(bearer: string | null, corpo: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/pacing/numero", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7",
      ...(bearer === null ? {} : { authorization: `Bearer ${bearer}` }),
    },
    body: JSON.stringify(corpo),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.env.TENANT_PROVISIONING_SECRET = SEGREDO;
  h.limite.mockResolvedValue({ allowed: true, count: 1, limit: 10, window_sec: 60 });
  h.espiar.mockResolvedValue(0);
  h.sessao.mockResolvedValue({ data: { id: "sess-1", organization_id: "org-1" }, error: null });
});

describe("POST /api/v1/pacing/numero", () => {
  it("sem segredo configurado a rota não existe (404)", async () => {
    h.env.TENANT_PROVISIONING_SECRET = "";
    const r = await POST(pedido(SEGREDO, { session_name: "x", action: "pedir" }));
    expect(r.status).toBe(404);
  });

  it("bearer errado: 401 e conta a falha", async () => {
    const r = await POST(pedido("errado", { session_name: "x", action: "pedir" }));
    expect(r.status).toBe(401);
    expect(h.limite).toHaveBeenCalledTimes(1);
    expect(h.decide).not.toHaveBeenCalled();
  });

  it("corpo inválido: 400", async () => {
    const r = await POST(pedido(SEGREDO, { session_name: "x", action: "outra" }));
    expect(r.status).toBe(400);
  });

  it("sessão desconhecida: 404", async () => {
    h.sessao.mockResolvedValue({ data: null, error: null });
    const r = await POST(pedido(SEGREDO, { session_name: "nao-existe", action: "pedir" }));
    expect(r.status).toBe(404);
  });

  it("pedir liberado", async () => {
    h.decide.mockResolvedValue({ liberado: true });
    const r = await POST(pedido(SEGREDO, { session_name: "org_a_b", action: "pedir" }));
    expect(r.status).toBe(200);
    expect(JSON.stringify(await r.json())).toContain('"liberado":true');
    expect(h.decide).toHaveBeenCalledWith("org-1", "sess-1", expect.any(Date));
  });

  it("pedir não liberado devolve motivo e horário", async () => {
    const liberaEm = new Date("2026-11-02T03:00:00.000Z");
    h.decide.mockResolvedValue({ liberado: false, motivo: "teto_diario", liberaEm });
    const r = await POST(pedido(SEGREDO, { session_name: "org_a_b", action: "pedir" }));
    const texto = JSON.stringify(await r.json());
    expect(texto).toContain('"liberado":false');
    expect(texto).toContain("teto_diario");
    expect(texto).toContain("2026-11-02T03:00:00.000Z");
  });

  it("registrar grava no ledger da sessão", async () => {
    const r = await POST(pedido(SEGREDO, { session_name: "org_a_b", action: "registrar" }));
    expect(r.status).toBe(200);
    expect(h.registra).toHaveBeenCalledWith("org-1", "sess-1", expect.any(Date));
  });
});
