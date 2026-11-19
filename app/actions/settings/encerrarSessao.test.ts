/**
 * Encerrar UMA sessão de outro aparelho: o banco recusa a atual e devolve
 * `false` quando a sessão não é da pessoa (ou já caiu). Só o sucesso audita.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  audit: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-request-id": "req-1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@/lib/audit", () => ({ audit: m.audit }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-ana" } } }) },
    rpc: m.rpc,
  }),
}));

import { encerrarSessao } from "./encerrarSessao";

const ID = "6f1c2b9e-4a3d-4c8e-9b7a-1d2e3f4a5b6c";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("encerrarSessao", () => {
  it("id que não é uuid → invalida, sem tocar no banco", async () => {
    expect(await encerrarSessao("x")).toEqual({ ok: false, motivo: "invalida" });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("banco recusa a sessão atual → sessao_atual, sem auditoria", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "sessao_atual" } });
    expect(await encerrarSessao(ID)).toEqual({ ok: false, motivo: "sessao_atual" });
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("nada apagado → nao_encontrada, sem auditoria", async () => {
    m.rpc.mockResolvedValue({ data: false, error: null });
    expect(await encerrarSessao(ID)).toEqual({ ok: false, motivo: "nao_encontrada" });
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("apagou → audita auth.session_revoked e revalida a tela", async () => {
    m.rpc.mockResolvedValue({ data: true, error: null });
    expect(await encerrarSessao(ID)).toEqual({ ok: true });
    expect(m.rpc).toHaveBeenCalledWith("fn_encerrar_minha_sessao", { p_sessao: ID });
    expect(m.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.session_revoked",
        actorUserId: "u-ana",
        metadata: { session_id: ID },
        requestId: "req-1",
      }),
    );
    expect(m.revalidatePath).toHaveBeenCalledWith("/app/settings/security");
  });
});
