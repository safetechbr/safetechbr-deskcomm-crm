// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  support: vi.fn(),
  maybe: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: mocks.support }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: mocks.maybe,
    }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => ({ upload: mocks.upload }) } }),
}));
import { POST } from "./route";
const ctx = { params: Promise.resolve({ id: "fb000000-0000-4000-8000-000000000001" }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.support.mockResolvedValue(null);
  mocks.requireRole.mockResolvedValue({
    ok: true,
    org: { orgId: "fb000000-0000-4000-8000-000000000002" },
    user: { id: "fb000000-0000-4000-8000-000000000003" },
  });
});
function req(data: string) {
  const f = new FormData();
  f.append("file", new File([data], "doc.pdf", { type: "application/pdf" }));
  f.append("kind", "residencia");
  return new Request("http://localhost/api", { method: "POST", body: f });
}
describe("upload de documento cadastral", () => {
  it("recusa arquivo disfarçado sem acessar Storage", async () => {
    const r = await POST(req("<script>"), ctx);
    expect(r.status).toBe(422);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("recusa contato de outra empresa antes de subir bytes", async () => {
    mocks.maybe.mockResolvedValue({ data: null });
    const r = await POST(req("%PDF-1.7"), ctx);
    expect(r.status).toBe(404);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("respeita o bloqueio de suporte sem executar upload", async () => {
    mocks.support.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await POST(req("%PDF-1.7"), ctx)).status).toBe(403);
    expect(mocks.requireRole).not.toHaveBeenCalled();
  });
});
