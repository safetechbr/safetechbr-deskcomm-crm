/**
 * TOKEN DE REVENDA DA FOCUS: a tela nunca devolve o segredo e o banco vale mais que o .env.
 *
 * Sabotagem que confirma a guarda: passar `linha.token_revenda_encrypted` ao
 * formulário em `fiscal/page.tsx` deixa o primeiro caso vermelho.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CIFRA = "\\x_cifra_do_token_focus";
const TOKEN_DO_ENV = "token-do-env-focus-1234567890";
const TOKEN_DO_BANCO = "token-do-banco-focus-1234567890";

let linha: Record<string, string | null> | null = null;
let usuario: { is_platform_admin: boolean; idioma: "pt-BR" } | null = null;
const decifrar = vi.fn();

vi.mock("@/lib/auth/server", () => ({ loadAuthUser: async () => usuario }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: linha, error: null }) }) }),
    }),
  }),
}));
vi.mock("@/lib/webhooks/secrets", () => ({ decryptWebhookSecret: (...a: unknown[]) => decifrar(...a) }));
vi.mock("@/lib/env", () => ({ env: { FOCUS_TOKEN_REVENDA: TOKEN_DO_ENV } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/actions/settings/updateFocusToken", () => ({ updateFocusToken: vi.fn() }));

beforeEach(() => {
  linha = { token_revenda_encrypted: CIFRA, updated_at: "2026-11-21T12:00:00Z" };
  usuario = { is_platform_admin: true, idioma: "pt-BR" };
  decifrar.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("/admin/fiscal", () => {
  it("⭐ nenhum segredo (cifrado nem do .env) vai nas props do formulário", async () => {
    const { default: Page } = await import("@/app/admin/(protected)/fiscal/page");
    const props = JSON.stringify((await Page()).props);
    expect(props).not.toContain(CIFRA);
    expect(props).not.toContain(TOKEN_DO_ENV);
    expect(props).toContain('"temTokenSalvo":true');
    expect(decifrar).not.toHaveBeenCalled();
  });

  it("quem não é platform admin recebe 404", async () => {
    usuario = { is_platform_admin: false, idioma: "pt-BR" };
    const { default: Page } = await import("@/app/admin/(protected)/fiscal/page");
    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("tokenRevendaFocus", () => {
  it("o banco tem precedência sobre o .env", async () => {
    decifrar.mockResolvedValue(` ${TOKEN_DO_BANCO} `);
    const { tokenRevendaFocus } = await import("@/lib/fiscal/focus/token-revenda");
    expect(await tokenRevendaFocus()).toBe(TOKEN_DO_BANCO);
  });

  it("sem linha no banco, vale o .env", async () => {
    linha = null;
    const { tokenRevendaFocus } = await import("@/lib/fiscal/focus/token-revenda");
    expect(await tokenRevendaFocus()).toBe(TOKEN_DO_ENV);
  });

  it("decifra falhou: cai para o .env sem lançar", async () => {
    decifrar.mockRejectedValue(new Error("boom"));
    const { tokenRevendaFocus } = await import("@/lib/fiscal/focus/token-revenda");
    expect(await tokenRevendaFocus()).toBe(TOKEN_DO_ENV);
  });
});
