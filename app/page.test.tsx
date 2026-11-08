import { beforeEach, describe, expect, it, vi } from "vitest";

const cena = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: cena.getUser } }),
}));
import HomePage from "./page";

beforeEach(() => {
  cena.getUser.mockReset();
});
describe("/ — entrada direta no sistema", () => {
  it("sem sessão: vai direto ao login, sem página de apresentação", async () => {
    cena.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT:/login");
  });
  it("com sessão validada: entra no sistema, que aplica seus próprios controles", async () => {
    cena.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT:/app");
    expect(cena.getUser).toHaveBeenCalledOnce();
  });
  it("sessão inválida ou expirada: volta ao login", async () => {
    cena.getUser.mockResolvedValue({ data: { user: null }, error: { message: "Invalid JWT" } });
    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});
