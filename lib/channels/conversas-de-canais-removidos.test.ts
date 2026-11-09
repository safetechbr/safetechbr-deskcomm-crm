import { describe, expect, it, vi } from "vitest";

vi.mock("./apagar-historico", () => ({
  apagarHistoricoDoCanal: vi.fn(async (_a: unknown, _o: string, id: string) => ({
    mensagens: id === "c1" ? 5 : 2,
    chamadas_de_voz: 0,
    conversas: id === "c1" ? 3 : 1,
  })),
}));

import { apagarHistoricoDoCanal } from "./apagar-historico";
import {
  apagarSobrasDeCanaisRemovidos,
  listarSobrasDeCanaisRemovidos,
} from "./conversas-de-canais-removidos";

function fakeAdmin(contagens: Record<string, { conversations: number; messages: number }>) {
  const filtrosDeCanais: string[] = [];
  const admin = {
    from(tabela: string) {
      if (tabela === "channel_sessions") {
        const q = {
          select: () => q,
          eq: (c: string, v: string) => (filtrosDeCanais.push(`${c}=${v}`), q),
          not: (c: string, op: string, v: unknown) => (
            filtrosDeCanais.push(`not:${c}:${op}:${String(v)}`),
            Promise.resolve({
              data: [
                { id: "c1", provider: "whatsapp", display_name: "Antigo", phone_number: null },
                { id: "c2", provider: "instagram", display_name: null, phone_number: "123" },
                { id: "c3", provider: "whatsapp", display_name: "Vazio", phone_number: null },
              ],
              error: null,
            })
          ),
        };
        return q;
      }
      let canal = "";
      const q = {
        select: () => q,
        eq: (c: string, v: string) => {
          if (c === "channel_session_id") canal = v;
          return c === "channel_session_id"
            ? Promise.resolve({ count: contagens[canal]?.[tabela as "conversations" | "messages"] ?? 0, error: null })
            : q;
        },
      };
      return q;
    },
  };
  return { admin: admin as never, filtrosDeCanais };
}

describe("conversas de canais removidos", () => {
  it("lista só canais arquivados da organização, com sobra", async () => {
    const { admin, filtrosDeCanais } = fakeAdmin({
      c1: { conversations: 3, messages: 5 },
      c2: { conversations: 1, messages: 2 },
    });
    const r = await listarSobrasDeCanaisRemovidos(admin, "org1");
    expect(filtrosDeCanais).toContain("organization_id=org1");
    expect(filtrosDeCanais).toContain("not:archived_at:is:null");
    expect(r.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(r[1]?.nome).toBe("123");
  });

  it("apaga só os canais com sobra e soma os totais", async () => {
    const { admin } = fakeAdmin({
      c1: { conversations: 3, messages: 5 },
      c2: { conversations: 1, messages: 2 },
    });
    const r = await apagarSobrasDeCanaisRemovidos(admin, "org1");
    expect(r.canais).toBe(2);
    expect(r.total).toEqual({ mensagens: 7, chamadas_de_voz: 0, conversas: 4 });
    expect(apagarHistoricoDoCanal).not.toHaveBeenCalledWith(admin, "org1", "c3");
  });
});
