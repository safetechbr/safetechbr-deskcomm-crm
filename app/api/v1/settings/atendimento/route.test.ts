import { beforeEach, it, expect, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET, PUT } from "./route";
const ctx = vi.hoisted(() => ({ role: "admin", rpc: vi.fn(), audit: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: vi.fn(async (role: string) =>
    ctx.role === role
      ? { ok: true, org: { orgId: "empresa" }, user: { id: "admin" } }
      : { ok: false, response: NextResponse.json({ error: {} }, { status: 403 }) },
  ),
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/audit", () => ({ audit: (...args: unknown[]) => ctx.audit(...args) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: ctx.rpc,
    from: () => ({
      select: (s: string) => {
        ctx.select(s);
        return {
          eq: () => ({ maybeSingle: async () => ({ data: { updated_at: "hoje" }, error: null }) }),
        };
      },
    }),
  }),
}));
beforeEach(() => {
  ctx.role = "admin";
  ctx.rpc.mockReset().mockResolvedValue({ error: null });
  ctx.audit.mockReset();
  ctx.select.mockClear();
});
function request(body: unknown) {
  return new NextRequest("http://localhost/api/v1/settings/atendimento", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
it("só administrador pode definir e consultar a senha", async () => {
  for (const role of ["agent", "manager", "viewer"]) {
    ctx.role = role;
    expect((await PUT(request({ senha: "Teste12345" }))).status).toBe(403);
    expect((await GET()).status).toBe(403);
  }
  expect(ctx.rpc).not.toHaveBeenCalled();
});
it("gera hash no banco usando ator e empresa da sessão; nunca audita a senha", async () => {
  expect(
    (await PUT(request({ senha: "Teste12345", p_actor: "outro", p_org: "outra" }))).status,
  ).toBe(200);
  expect(ctx.rpc).toHaveBeenCalledWith("fn_atendimento_definir_senha", {
    p_org: "empresa",
    p_actor: "admin",
    p_senha: "Teste12345",
  });
  expect(JSON.stringify(ctx.audit.mock.calls)).not.toContain("Teste12345");
});
it("consulta somente a existência e a data da configuração", async () => {
  const r = await GET();
  expect(await r.json()).toMatchObject({ data: { configurada: true } });
  expect(ctx.select).toHaveBeenCalledWith("updated_at");
});
it("recusa senhas curtas e as que excedem o limite em bytes do bcrypt", async () => {
  for (const senha of ["curta", "á".repeat(40)])
    expect((await PUT(request({ senha }))).status).toBe(422);
  expect(ctx.rpc).not.toHaveBeenCalled();
});
