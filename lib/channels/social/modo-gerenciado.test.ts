import { afterEach, beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ req: vi.fn() }));
vi.mock("@/lib/webhooks/secrets", () => ({
  decryptWebhookSecret: async () => "chave-propria",
  encryptWebhookSecret: async () => "enc",
}));
vi.mock("./client", async (orig) => ({
  ...(await orig<typeof import("./client")>()),
  socialRequest: h.req,
}));

import { provisionarPerfilGerenciado, readSocialIntegration } from "./store";

function fakeDb(linha: Record<string, unknown> | null) {
  const upserts: Record<string, unknown>[] = [];
  const filtros: Record<string, unknown> = {};
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => ((filtros[k] = v), q),
    maybeSingle: async () => ({ data: linha, error: null }),
    upsert: async (row: Record<string, unknown>) => (upserts.push(row), { error: null }),
  };
  return { db: { from: () => q } as never, upserts, filtros };
}

beforeEach(() => {
  h.req.mockReset();
  process.env.ZERNIO_SOCIAL_PLATFORM_KEY = "mestra-123456";
});
afterEach(() => {
  delete process.env.ZERNIO_SOCIAL_PLATFORM_KEY;
});

it("cria o perfil da organização e grava como gerenciado", async () => {
  h.req.mockResolvedValueOnce({ profile: { _id: "a".repeat(24) } });
  const { db, upserts, filtros } = fakeDb(null);
  const r = await provisionarPerfilGerenciado(db, "org-1");
  expect(r).toEqual({ profileId: "a".repeat(24), created: true });
  expect(filtros.organization_id).toBe("org-1");
  expect(h.req.mock.calls[0]![0]).toBe("mestra-123456");
  expect(h.req.mock.calls[0]![2]).toMatchObject({ name: "crm-org-1", externalId: "org-1" });
  expect(upserts[0]).toMatchObject({ organization_id: "org-1", managed: true });
});

it("é idempotente: já gerenciado não chama o provedor", async () => {
  const { db } = fakeDb({ profile_id: "p", managed: true });
  expect(await provisionarPerfilGerenciado(db, "org-1")).toEqual({ profileId: "p", created: false });
  expect(h.req).not.toHaveBeenCalled();
});

it("recusa quando a organização já usa chave própria", async () => {
  const { db } = fakeDb({ profile_id: "p", managed: false });
  await expect(provisionarPerfilGerenciado(db, "org-1")).rejects.toMatchObject({ status: 409 });
});

it("reaproveita o perfil existente se a criação falhar", async () => {
  h.req
    .mockRejectedValueOnce(new Error("conflito"))
    .mockResolvedValueOnce({ profiles: [{ _id: "b".repeat(24), name: "crm-org-1" }] });
  const { db } = fakeDb(null);
  expect((await provisionarPerfilGerenciado(db, "org-1")).profileId).toBe("b".repeat(24));
});

it("sem chave mestra, recusa", async () => {
  delete process.env.ZERNIO_SOCIAL_PLATFORM_KEY;
  await expect(provisionarPerfilGerenciado(fakeDb(null).db, "org-1")).rejects.toMatchObject({
    status: 422,
  });
});

it("leitura gerenciada usa a chave do ambiente, não a gravada", async () => {
  const { db } = fakeDb({ profile_id: "p", credential_encrypted: "x", managed: true });
  expect(await readSocialIntegration(db, "org-1")).toEqual({
    profileId: "p",
    key: "mestra-123456",
    managed: true,
  });
});
