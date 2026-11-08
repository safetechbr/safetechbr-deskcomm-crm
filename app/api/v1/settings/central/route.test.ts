import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  support: vi.fn(),
  client: vi.fn(),
  admin: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: h.auth }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: h.support }));
vi.mock("@/lib/supabase/server", () => ({ createClient: h.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: h.admin }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));

import { GET, PATCH } from "./route";

const ORG = "10000000-0000-4000-8000-000000000001";
const PIPE = "20000000-0000-4000-8000-000000000001";
const OUTRO = "20000000-0000-4000-8000-000000000002";
const FUNIL = { id: PIPE, name: "Vendas" };
type Resultado = { data: unknown; error: { message: string } | null };
const row = (data: unknown): Resultado => ({ data, error: null });

function banco(rows: Record<string, Resultado[]>) {
  const queries: Array<{ table: string; b: Record<string, ReturnType<typeof vi.fn>> }> = [];
  const from = vi.fn((table: string) => {
    const b: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq", "order", "limit", "update", "filter", "is"])
      b[method] = vi.fn(() => b);
    b.maybeSingle = vi.fn(async () => rows[table]?.shift() ?? row(null));
    queries.push({ table, b });
    return b;
  });
  return { from, queries };
}
const req = (body: unknown) =>
  new Request("http://localhost/api/v1/settings/central", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  h.auth.mockResolvedValue({
    ok: true,
    user: { id: "user-1", idioma: "pt-BR" },
    org: { orgId: ORG },
  });
  h.support.mockResolvedValue(null);
});

describe("principal da central, independente do funil de entrada", () => {
  it("lê a escolha da organização e limita o funil à mesma empresa", async () => {
    const db = banco({
      organizations: [row({ settings: { central: { pipeline_id: PIPE } } })],
      crm_pipelines: [row(FUNIL)],
    });
    h.client.mockResolvedValue(db);
    const response = await GET();
    expect((await response.json()).data).toEqual({
      pipeline: FUNIL,
      substituido: false,
      configurado: true,
    });
    expect(db.queries[0]!.b.eq).toHaveBeenCalledWith("id", ORG);
    expect(db.queries[1]!.b.eq).toHaveBeenCalledWith("organization_id", ORG);
    expect(db.queries[1]!.b.eq).toHaveBeenCalledWith("is_archived", false);
    expect(h.admin).not.toHaveBeenCalled();
  });

  it("funil arquivado ou excluído tem um caminho de volta ao padrão vivo", async () => {
    const db = banco({
      organizations: [row({ settings: { central: { pipeline_id: OUTRO } } })],
      crm_pipelines: [row(null), row(FUNIL)],
    });
    h.client.mockResolvedValue(db);
    expect((await (await GET()).json()).data).toEqual({
      pipeline: FUNIL,
      substituido: true,
      configurado: false,
    });
    expect(db.queries[2]!.b.order).toHaveBeenCalledWith("is_default", { ascending: false });
    expect(db.queries[2]!.b.eq).toHaveBeenCalledWith("organization_id", ORG);
  });

  it("sem funis devolve vazio; sem configuração usa o padrão sem gravar nada", async () => {
    const db = banco({ organizations: [row({ settings: null })], crm_pipelines: [row(null)] });
    h.client.mockResolvedValue(db);
    expect((await (await GET()).json()).data).toEqual({
      pipeline: null,
      substituido: false,
      configurado: false,
    });
    expect(h.admin).not.toHaveBeenCalled();
  });

  it("salva só a preferência da central com CAS e preserva outros settings", async () => {
    const settings = {
      visibility_mode: "own",
      central: { outra_preferencia: true },
      security: { mfa_required: true },
    };
    const db = banco({ crm_pipelines: [row(FUNIL)] });
    const admin = banco({ organizations: [row({ settings }), row({ id: ORG })] });
    h.client.mockResolvedValue(db);
    h.admin.mockReturnValue(admin);
    expect((await PATCH(req({ pipeline_id: PIPE }))).status).toBe(200);
    expect(h.auth).toHaveBeenCalledWith("manager", expect.any(Object));
    expect(db.queries[0]!.b.eq).toHaveBeenCalledWith("organization_id", ORG);
    const update = admin.queries[1]!.b;
    expect(update.eq).toHaveBeenCalledWith("id", ORG);
    expect(update.filter).toHaveBeenCalledWith("settings", "eq", JSON.stringify(settings));
    expect(update.update).toHaveBeenCalledWith({
      settings: {
        ...settings,
        central: { outra_preferencia: true, pipeline_id: PIPE },
      },
    });
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.central_pipeline_updated",
        organizationId: ORG,
        metadata: { pipeline_id: PIPE },
      }),
    );
    expect(admin.from).toHaveBeenCalledTimes(2);
    expect(admin.from).toHaveBeenCalledWith("organizations");
  });

  it("concorrência não sobrescreve configuração e não emite sucesso ou auditoria", async () => {
    h.client.mockResolvedValue(banco({ crm_pipelines: [row(FUNIL)] }));
    const admin = banco({ organizations: [row({ settings: null }), row(null)] });
    h.admin.mockReturnValue(admin);
    expect((await PATCH(req({ pipeline_id: PIPE }))).status).toBe(409);
    expect(admin.queries[1]!.b.is).toHaveBeenCalledWith("settings", null);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("recusa funil de outra empresa ou arquivado antes de tentar gravar", async () => {
    h.client.mockResolvedValue(banco({ crm_pipelines: [row(null)] }));
    expect((await PATCH(req({ pipeline_id: OUTRO }))).status).toBe(404);
    expect(h.admin).not.toHaveBeenCalled();
  });

  it("recusa dados inválidos e organização injetada no corpo", async () => {
    expect((await PATCH(req({ pipeline_id: "inválido" }))).status).toBe(422);
    expect((await PATCH(req({ pipeline_id: PIPE, organization_id: ORG }))).status).toBe(422);
    expect(h.client).not.toHaveBeenCalled();
  });

  it("vendedor sem gestão e suporte de leitura não gravam", async () => {
    h.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await PATCH(req({ pipeline_id: PIPE }))).status).toBe(403);
    expect(h.admin).not.toHaveBeenCalled();
    h.auth.mockClear();
    h.support.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await PATCH(req({ pipeline_id: PIPE }))).status).toBe(403);
    expect(h.auth).not.toHaveBeenCalled();
  });
});
