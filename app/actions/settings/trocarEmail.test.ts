/**
 * Troca do próprio e-mail: valida, exige a senha atual e só então pede ao
 * GoTrue a troca (que manda o link de confirmação). Audita só o hash do e-mail.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  audit: vi.fn(),
  conferir: vi.fn(),
  updateUser: vi.fn(),
  sessionAal: vi.fn(),
  nextLevel: "aal1" as string,
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-request-id": "req-1" }) }));
vi.mock("@/lib/audit", () => ({ audit: m.audit, hashEmail: (e: string) => `hash:${e}` }));
vi.mock("@/lib/auth/conferir-senha-atual", () => ({ conferirSenhaAtual: m.conferir }));
vi.mock("@/lib/auth/server", () => ({ sessionAal: m.sessionAal }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.test" } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "u-ana", email: "ana@exemplo.test" } } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { nextLevel: m.nextLevel } }) },
      updateUser: m.updateUser,
    },
  }),
}));

import { trocarEmail } from "./trocarEmail";

beforeEach(() => {
  vi.clearAllMocks();
  m.nextLevel = "aal1";
  m.conferir.mockResolvedValue(true);
  m.updateUser.mockResolvedValue({ error: null });
});

describe("trocarEmail", () => {
  it("recusa e-mail inválido sem chamar o GoTrue", async () => {
    expect(await trocarEmail({ email: "nao-e-email", current_password: "x" })).toEqual({
      ok: false,
      error: "validation_error",
    });
    expect(m.updateUser).not.toHaveBeenCalled();
  });

  it("recusa o mesmo e-mail, ignorando maiúsculas e espaços", async () => {
    const r = await trocarEmail({ email: "  ANA@exemplo.test ", current_password: "x" });
    expect(r).toEqual({ ok: false, error: "same_email" });
  });

  it("exige AAL2 quando a conta tem duas etapas", async () => {
    m.nextLevel = "aal2";
    m.sessionAal.mockResolvedValue("aal1");
    const r = await trocarEmail({ email: "nova@exemplo.test", current_password: "x" });
    expect(r).toEqual({ ok: false, error: "mfa_required" });
    expect(m.updateUser).not.toHaveBeenCalled();
  });

  it("senha atual errada não troca nada", async () => {
    m.conferir.mockResolvedValue(false);
    const r = await trocarEmail({ email: "nova@exemplo.test", current_password: "errada" });
    expect(r).toEqual({ ok: false, error: "wrong_current_password" });
    expect(m.conferir).toHaveBeenCalledWith("ana@exemplo.test", "errada");
    expect(m.updateUser).not.toHaveBeenCalled();
  });

  it("pede a troca com o link de volta e audita só o hash", async () => {
    const r = await trocarEmail({ email: "Nova@Exemplo.test", current_password: "certa" });
    expect(r).toEqual({ ok: true });
    expect(m.updateUser).toHaveBeenCalledWith(
      { email: "nova@exemplo.test" },
      { emailRedirectTo: "https://crm.exemplo.test/login/email-confirmado" },
    );
    expect(m.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.email_change_requested",
        actorUserId: "u-ana",
        metadata: { novo_email_hash: "hash:nova@exemplo.test" },
      }),
    );
  });

  it("e-mail já usado por outra conta vira email_in_use", async () => {
    m.updateUser.mockResolvedValue({
      error: { code: "email_exists", status: 422, message: "A user with this email address has already been registered" },
    });
    const r = await trocarEmail({ email: "outra@exemplo.test", current_password: "certa" });
    expect(r).toEqual({ ok: false, error: "email_in_use" });
    expect(m.audit).not.toHaveBeenCalled();
  });
});
