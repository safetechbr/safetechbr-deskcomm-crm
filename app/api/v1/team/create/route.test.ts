import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(), support: vi.fn(), createUser: vi.fn(), rpc: vi.fn(), deleteUser: vi.fn(), updateUserById: vi.fn(), audit: vi.fn(),
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.guard }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: mocks.support }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc, auth: { admin: { createUser: mocks.createUser, deleteUser: mocks.deleteUser, updateUserById: mocks.updateUserById } } }) }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit, isServiceRoleConfigured: () => true }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
import { POST } from "./route";

const input = { full_name: "João", username: "Joao", password: "SenhaTeste123!", role: "agent", interface_settings: { preset: "simplificada" }, organization_id: "outra-empresa" };
function request(body = input) { return new NextRequest("http://localhost/api/v1/team/create", { method: "POST", body: JSON.stringify(body) }); }
describe("criação direta de vendedor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.support.mockResolvedValue(null);
    mocks.guard.mockResolvedValue({ ok: true, org: { orgId: "empresa-da-sessao" }, user: { id: "admin", idioma: "pt-BR" } });
    mocks.createUser.mockResolvedValue({ data: { user: { id: "novo-vendedor" } }, error: null });
    mocks.rpc.mockResolvedValue({ data: { id: "vinculo", changed: true }, error: null });
    mocks.deleteUser.mockResolvedValue({ error: null });
    mocks.updateUserById.mockResolvedValue({ error: null });
  });
  it("usa organização da sessão, confirma apenas a conta nova e grava papel/interface", async () => {
    const res = await POST(request());
    expect(res.status).toBe(201);
    expect(mocks.guard).toHaveBeenCalledWith("admin", expect.any(Object));
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "joao@usuarios.login.invalid", password: input.password, email_confirm: true, app_metadata: { managed_by_organization: "empresa-da-sessao" } }));
    expect(mocks.rpc).toHaveBeenCalledWith("fn_accept_team_invite", expect.objectContaining({ p_org: "empresa-da-sessao", p_role: "agent", p_interface_settings: input.interface_settings }));
    expect(mocks.createUser.mock.calls[0]?.[0].ban_duration).toBe("876000h");
    expect(mocks.updateUserById).toHaveBeenCalledWith("novo-vendedor", { ban_duration: "none" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "member.created" }));
    expect(JSON.stringify(await res.json())).not.toContain(input.password);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(input.password);
  });
  it("não cria conta sem autorização ou durante suporte somente leitura", async () => {
    mocks.guard.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await POST(request())).status).toBe(403);
    mocks.support.mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect((await POST(request())).status).toBe(403);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
  it("recusa login duplicado sem vincular nem alterar a conta existente", async () => {
    mocks.createUser.mockResolvedValueOnce({ data: { user: null }, error: { code: "email_exists" } });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("remove apenas a conta nova quando o vínculo falha", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { code: "PT402", message: "limite_do_plano:assentos:2" } });
    const res = await POST(request());
    expect(res.status).toBe(409);
    expect(mocks.deleteUser).toHaveBeenCalledWith("novo-vendedor");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("valida a senha e o papel antes de tocar no provedor", async () => {
    expect((await POST(request({ ...input, password: "123" }))).status).toBe(422);
    expect((await POST(request({ ...input, role: "superadmin" }))).status).toBe(422);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});
