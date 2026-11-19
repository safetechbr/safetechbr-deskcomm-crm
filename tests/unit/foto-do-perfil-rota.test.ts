// @vitest-environment node
/** A rota da foto do perfil: só a própria pasta, só PNG/JPEG reais, e a ordem sobe → grava → apaga. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const uid = "11111111-1111-4111-8111-111111111111";
const antigo = `${uid}/33333333-3333-4333-8333-333333333333.png`;

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; user_metadata: Record<string, unknown> },
  updateUser: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  download: vi.fn(),
  audit: vi.fn(),
  allowed: true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }), updateUser: mocks.updateUser },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove, download: mocks.download }) },
  }),
}));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: mocks.allowed }) }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));

import { DELETE, GET, POST } from "@/app/api/v1/me/avatar/route";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);

function post(bytes: Buffer = PNG) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], "foto.png", { type: "image/png" }));
  return new NextRequest("http://localhost/api/v1/me/avatar", { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: uid, user_metadata: { avatar_path: antigo } };
  mocks.allowed = true;
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.audit.mockResolvedValue(undefined);
});

describe("POST /api/v1/me/avatar", () => {
  it("sem sessão → 401 e nada sobe", async () => {
    mocks.user = null;
    expect((await POST(post())).status).toBe(401);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("bytes que não são imagem → 415, mesmo declarando image/png", async () => {
    expect((await POST(post(Buffer.from("<svg onload=alert(1)>")))).status).toBe(415);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("acima de 512 KB → 413", async () => {
    const grande = Buffer.concat([PNG, Buffer.alloc(512 * 1024)]);
    expect((await POST(post(grande))).status).toBe(413);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("limite estourado → 429", async () => {
    mocks.allowed = false;
    expect((await POST(post())).status).toBe(429);
  });

  it("sucesso sobe na pasta da pessoa, grava o caminho e apaga a foto antiga", async () => {
    const res = await POST(post());
    expect(res.status).toBe(200);
    const caminho = mocks.upload.mock.calls[0]?.[0] as string;
    expect(caminho).toMatch(new RegExp(`^${uid}/[0-9a-f-]{36}\\.png$`));
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { avatar_path: caminho, avatar_url: null } });
    expect(mocks.remove).toHaveBeenCalledWith([antigo]);
    const corpo = (await res.json()) as { data: { avatar_url: string } };
    expect(corpo.data.avatar_url).toBe(`/api/v1/me/avatar?v=${encodeURIComponent(caminho.slice(uid.length + 1))}`);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "profile.updated", metadata: { avatar: "atualizado" } }));
  });

  it("falha ao gravar no perfil apaga o arquivo NOVO e mantém o antigo", async () => {
    mocks.updateUser.mockResolvedValue({ error: { message: "boom" } });
    expect((await POST(post())).status).toBe(500);
    const caminho = mocks.upload.mock.calls[0]?.[0] as string;
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith([caminho]);
  });

  it("caminho antigo fora da pasta da pessoa nunca é apagado", async () => {
    mocks.user = { id: uid, user_metadata: { avatar_path: "44444444-4444-4444-8444-444444444444/55555555-5555-4555-8555-555555555555.png" } };
    expect((await POST(post())).status).toBe(200);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/me/avatar", () => {
  it("limpa o metadata e apaga o arquivo", async () => {
    expect((await DELETE()).status).toBe(200);
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { avatar_path: null, avatar_url: null } });
    expect(mocks.remove).toHaveBeenCalledWith([antigo]);
  });
});

describe("GET /api/v1/me/avatar", () => {
  it("recusa caminho fora da pasta da pessoa sem baixar nada", async () => {
    mocks.user = { id: uid, user_metadata: { avatar_path: "../outra/foto.png" } };
    expect((await GET()).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("serve os bytes com o tipo farejado e cache privado", async () => {
    mocks.download.mockResolvedValue({ data: new Blob([PNG]), error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toContain("private");
  });
});
