import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({ guard: vi.fn(), support: vi.fn(), maybeSingle: vi.fn(), eq: vi.fn(), getUserById: vi.fn(), updateUserById: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: m.guard }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: m.support }));
vi.mock("@/lib/audit", () => ({ audit: m.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => {
  const chain = { select: () => chain, eq: (...args: unknown[]) => { m.eq(...args); return chain; }, is: () => chain, maybeSingle: m.maybeSingle };
  return { from: () => chain, auth: { admin: { getUserById: m.getUserById, updateUserById: m.updateUserById } } };
} }));
import { PATCH } from "./route";
const userId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ user_id: userId }) };
const req = () => new NextRequest("http://localhost/api/v1/team/x/password", { method: "PATCH", body: JSON.stringify({ password: "SenhaNova123!" }) });
describe("senha do vendedor gerenciada pelo administrador", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.support.mockResolvedValue(null);
    m.guard.mockResolvedValue({ ok: true, org: { orgId: "empresa-a" }, user: { id: "admin" } });
    m.maybeSingle.mockResolvedValue({ data: { user_id: userId }, error: null });
    m.getUserById.mockResolvedValue({ data: { user: { email: "joao@usuarios.login.invalid", app_metadata: { managed_by_organization: "empresa-a" } } }, error: null });
    m.updateUserById.mockResolvedValue({ error: null });
  });
  it("exige administrador, filtra empresa e só redefine acesso gerenciado", async () => {
    expect((await PATCH(req(), context)).status).toBe(200);
    expect(m.guard).toHaveBeenCalledWith("admin", expect.any(Object));
    expect(m.eq).toHaveBeenCalledWith("organization_id", "empresa-a");
    expect(m.eq).toHaveBeenCalledWith("user_id", userId);
    expect(m.updateUserById).toHaveBeenCalledWith(userId, { password: "SenhaNova123!" });
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain("SenhaNova123!");
  });
  it("não altera usuário de outra empresa", async () => {
    m.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect((await PATCH(req(), context)).status).toBe(404);
    expect(m.getUserById).not.toHaveBeenCalled();
    expect(m.updateUserById).not.toHaveBeenCalled();
  });
  it("não altera conta por e-mail nem conta gerenciada por outra empresa", async () => {
    for (const user of [{ email: "dono@empresa.com", app_metadata: {} }, { email: "joao@usuarios.login.invalid", app_metadata: { managed_by_organization: "empresa-b" } }]) {
      m.getUserById.mockResolvedValueOnce({ data: { user }, error: null });
      expect((await PATCH(req(), context)).status).toBe(403);
    }
    expect(m.updateUserById).not.toHaveBeenCalled();
  });
  it("não permite redefinir sem autorização", async () => {
    m.guard.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await PATCH(req(), context)).status).toBe(403);
    expect(m.updateUserById).not.toHaveBeenCalled();
  });
});
