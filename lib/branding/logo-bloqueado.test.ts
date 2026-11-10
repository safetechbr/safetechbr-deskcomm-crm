// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const resposta = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: resposta }) }) }),
  }),
}));

import {
  invalidarTravaDoLogo,
  logoDasEmpresasBloqueado,
  semOsLogosDaOrganizacao,
} from "./logo-bloqueado";

beforeEach(() => {
  invalidarTravaDoLogo();
  resposta.mockReset();
});

describe("logoDasEmpresasBloqueado", () => {
  it("lê false só quando o dono desligou", async () => {
    resposta.mockResolvedValue({ data: { logo_bloqueado: false }, error: null });
    expect(await logoDasEmpresasBloqueado()).toBe(false);
  });
  it("padrão é bloqueado: linha ausente, true, erro e exceção", async () => {
    resposta.mockResolvedValue({ data: null, error: null });
    expect(await logoDasEmpresasBloqueado()).toBe(true);
    invalidarTravaDoLogo();
    resposta.mockResolvedValue({ data: null, error: { message: "coluna não existe" } });
    expect(await logoDasEmpresasBloqueado()).toBe(true);
    invalidarTravaDoLogo();
    resposta.mockRejectedValue(new Error("rede"));
    expect(await logoDasEmpresasBloqueado()).toBe(true);
  });
});

describe("semOsLogosDaOrganizacao", () => {
  it("remove os dois logos e preserva o resto", () => {
    const r = semOsLogosDaOrganizacao({
      outro: 1,
      branding: { name: "X", logo_path: "a.png", logo_dark_path: "b.png" },
    } as never) as { outro: number; branding: Record<string, unknown> };
    expect(r.outro).toBe(1);
    expect(r.branding).toEqual({ name: "X" });
  });
  it("aceita settings nulo", () => {
    expect(() => semOsLogosDaOrganizacao(null)).not.toThrow();
  });
});
