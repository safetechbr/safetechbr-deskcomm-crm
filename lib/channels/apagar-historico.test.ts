import { describe, expect, it } from "vitest";
import { apagarHistoricoDoCanal } from "./apagar-historico";

type Chamada = {
  tabela: string;
  op: "select" | "delete";
  eq: Record<string, unknown>;
  in: Record<string, unknown[]>;
};

/**
 * Banco de mentira: conv-1 é do canal; lead-1 nasceu dela; lead-2 é retomada
 * de lead-1; lead-3 é a cópia de lead-1 num outro funil. O filtro de `crm_lead_activities` imita o banco: só devolve
 * negócio cujo `source_id` está entre as conversas pedidas.
 */
function fakeAdmin(falharEm?: string) {
  const chamadas: Chamada[] = [];
  const nascimentos: Record<string, string> = { "conv-1": "lead-1", "conv-outra": "lead-outro" };
  const retomadas: Record<string, string> = { "lead-1": "lead-2" };
  // Cópia por troca de funil com o card ainda aberto: só `source_metadata.clonado_de`.
  const clones: Record<string, string> = { "lead-1": "lead-3" };
  const admin = {
    from(tabela: string) {
      const c: Chamada = { tabela, op: "select", eq: {}, in: {} };
      const q = {
        select: () => q,
        delete: () => ((c.op = "delete"), q),
        order: () => q,
        range: () => q,
        eq(col: string, val: unknown) {
          c.eq[col] = val;
          return q;
        },
        in(col: string, vals: unknown[]) {
          c.in[col] = vals;
          return q;
        },
        then(res: (v: unknown) => void) {
          chamadas.push(c);
          if (tabela === falharEm) return res({ data: null, count: null, error: { message: "boom" } });
          if (c.op === "delete") {
            const count = tabela === "crm_leads" ? (c.in.id ?? []).length : tabela === "messages" ? 5 : 2;
            return res({ count, error: null });
          }
          if (tabela === "conversations") return res({ data: [{ id: "conv-1" }], error: null });
          if (tabela === "crm_lead_activities")
            return res({
              data: (c.in.source_id as string[]).filter((s) => nascimentos[s]).map((s) => ({ lead_id: nascimentos[s] })),
              error: null,
            });
          const [coluna, pedidos] = Object.entries(c.in)[0] as [string, string[]];
          const filhos = coluna === "retomado_de_lead_id" ? retomadas : clones;
          return res({
            data: pedidos.filter((l) => filhos[l]).map((l) => ({ id: filhos[l] })),
            error: null,
          });
        },
      };
      return q;
    },
  };
  return { admin: admin as never, chamadas };
}

describe("apagarHistoricoDoCanal", () => {
  it("apaga os negócios do canal (com retomadas) antes de mensagens, chamadas e conversas", async () => {
    const { admin, chamadas } = fakeAdmin();
    const r = await apagarHistoricoDoCanal(admin, "org-1", "canal-1");
    expect(r).toEqual({ negocios: 3, mensagens: 5, chamadas_de_voz: 2, conversas: 2 });

    const deletes = chamadas.filter((c) => c.op === "delete");
    expect(deletes.map((c) => c.tabela)).toEqual(["crm_leads", "messages", "voice_calls", "conversations"]);
    for (const c of deletes) expect(c.eq.organization_id).toBe("org-1");
    for (const c of deletes.slice(1)) expect(c.eq.channel_session_id).toBe("canal-1");
  });

  it("não deixa card do funil de pé: todo negócio nascido do canal entra no delete", async () => {
    const { admin, chamadas } = fakeAdmin();
    await apagarHistoricoDoCanal(admin, "org-1", "canal-1");
    const apagados = chamadas
      .filter((c) => c.tabela === "crm_leads" && c.op === "delete")
      .flatMap((c) => c.in.id);
    expect(apagados.sort()).toEqual(["lead-1", "lead-2", "lead-3"]);
  });

  it("não apaga negócio de outro canal nem criado fora do ingest", async () => {
    const { admin, chamadas } = fakeAdmin();
    await apagarHistoricoDoCanal(admin, "org-1", "canal-1");
    const atividade = chamadas.find((c) => c.tabela === "crm_lead_activities")!;
    expect(atividade.eq).toMatchObject({ organization_id: "org-1", type: "lead_created" });
    expect(atividade.in.source_module).toEqual(["canal.ingest", "waha.ingest"]);
    expect(atividade.in.source_id).toEqual(["conv-1"]);
    const apagados = chamadas.filter((c) => c.op === "delete").flatMap((c) => c.in.id ?? []);
    expect(apagados).not.toContain("lead-outro");
  });

  it("para no primeiro erro, sem tocar nas tabelas seguintes", async () => {
    const { admin, chamadas } = fakeAdmin("voice_calls");
    await expect(apagarHistoricoDoCanal(admin, "o", "c")).rejects.toThrow(/voice_calls/);
    expect(chamadas.filter((c) => c.op === "delete").map((c) => c.tabela)).toEqual([
      "crm_leads",
      "messages",
      "voice_calls",
    ]);
  });
});
