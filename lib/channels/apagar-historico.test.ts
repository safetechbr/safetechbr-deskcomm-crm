import { describe, expect, it } from "vitest";
import { apagarHistoricoDoCanal } from "./apagar-historico";

function fakeAdmin(falharEm?: string) {
  const chamadas: { tabela: string; filtros: Record<string, string> }[] = [];
  const admin = {
    from(tabela: string) {
      const filtros: Record<string, string> = {};
      const q = {
        delete: () => q,
        eq(col: string, val: string) {
          filtros[col] = val;
          return q;
        },
        then(res: (v: unknown) => void) {
          chamadas.push({ tabela, filtros });
          res(
            tabela === falharEm
              ? { count: null, error: { message: "boom" } }
              : { count: tabela === "messages" ? 5 : 2, error: null },
          );
        },
      };
      return q;
    },
  };
  return { admin: admin as never, chamadas };
}

describe("apagarHistoricoDoCanal", () => {
  it("apaga mensagens, chamadas e conversas, nessa ordem, sempre filtrando por org e canal", async () => {
    const { admin, chamadas } = fakeAdmin();
    const r = await apagarHistoricoDoCanal(admin, "org-1", "canal-1");
    expect(r).toEqual({ mensagens: 5, chamadas_de_voz: 2, conversas: 2 });
    expect(chamadas.map((c) => c.tabela)).toEqual(["messages", "voice_calls", "conversations"]);
    for (const c of chamadas)
      expect(c.filtros).toEqual({ organization_id: "org-1", channel_session_id: "canal-1" });
  });

  it("para no primeiro erro, sem tocar nas tabelas seguintes", async () => {
    const { admin, chamadas } = fakeAdmin("voice_calls");
    await expect(apagarHistoricoDoCanal(admin, "o", "c")).rejects.toThrow(/voice_calls/);
    expect(chamadas.map((c) => c.tabela)).toEqual(["messages", "voice_calls"]);
  });
});
