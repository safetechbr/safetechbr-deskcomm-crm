import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/organizacao/operante", () => ({ idsDeOrgsParadas: vi.fn(async () => []) }));
vi.mock("./store", () => ({
  readSocialIntegration: vi.fn(async () => ({ profileId: "p", key: "k", managed: false })),
}));
const socialRequest = vi.fn();
vi.mock("./client", () => ({ socialRequest: (...a: unknown[]) => socialRequest(...a) }));

import { entregarVencidas } from "./entrega";

const AGORA = Date.parse("2026-11-09T12:00:00Z");
const ORG = "o1";
const CONTA = { id: "a".repeat(24), platform: "instagram" };

/** Banco falso mínimo: registra updates e devolve o que cada consulta precisa. */
function bancoFalso(opts: { vencidas: unknown[]; feitas?: unknown[]; trava?: boolean }) {
  const updates: { tabela: string; valores: Record<string, unknown> }[] = [];
  const db = {
    from(tabela: string) {
      let modo: "select" | "update" = "select";
      let valores: Record<string, unknown> = {};
      const filtros: string[] = [];
      const q: Record<string, unknown> = {};
      const resolver = () => {
        if (modo === "update") {
          updates.push({ tabela, valores });
          const ehTrava = valores.status === "publicando";
          return { data: ehTrava && opts.trava === false ? [] : [{ id: "x" }], error: null };
        }
        if (tabela === "social_seguranca") return { data: null, error: null };
        if (filtros.includes("status=publicada")) return { data: opts.feitas ?? [], error: null };
        return { data: opts.vencidas, error: null };
      };
      for (const m of ["select", "order", "limit", "lte", "lt", "gt", "is"]) q[m] = () => q;
      q.update = (v: Record<string, unknown>) => ((modo = "update"), (valores = v), q);
      q.eq = (c: string, v: string) => (filtros.push(`${c}=${v}`), q);
      q.maybeSingle = async () => resolver();
      q.then = (res: (v: unknown) => unknown) => res(resolver());
      return q;
    },
  };
  return { db: db as never, updates };
}

const vencida = (id: string, extra = {}) => ({
  id,
  organization_id: ORG,
  tipo: "feed",
  legenda: "oi",
  midias: [{ type: "image", url: "https://media.zernio.com/x.jpg" }],
  contas: [CONTA],
  tentativas: 0,
  provedor_post_id: null,
  ...extra,
});

describe("entregarVencidas", () => {
  it("entrega com publishNow e sem scheduledFor", async () => {
    socialRequest.mockResolvedValue({ post: { _id: "z1" } });
    const { db, updates } = bancoFalso({ vencidas: [vencida("p1")] });
    const r = await entregarVencidas(db, AGORA);
    expect(r.entregues).toBe(1);
    const corpo = socialRequest.mock.calls.at(-1)![2] as Record<string, unknown>;
    expect(corpo.publishNow).toBe(true);
    expect(corpo).not.toHaveProperty("scheduledFor");
    expect(updates.some((u) => u.valores.status === "publicada" && u.valores.provedor_post_id === "z1")).toBe(true);
  });

  it("a segunda publicação da mesma conta espera o intervalo na mesma rodada", async () => {
    socialRequest.mockReset();
    socialRequest.mockResolvedValue({ post: { _id: "z" } });
    const { db, updates } = bancoFalso({ vencidas: [vencida("p1"), vencida("p2")] });
    const r = await entregarVencidas(db, AGORA);
    expect(r.entregues).toBe(1);
    expect(r.adiadas).toBe(1);
    expect(socialRequest).toHaveBeenCalledTimes(1);
    expect(updates.some((u) => typeof u.valores.aguardando_motivo === "string")).toBe(true);
  });

  it("no limite diário adia sem chamar o provedor", async () => {
    socialRequest.mockReset();
    const feitas = Array.from({ length: 20 }, (_, i) => ({
      contas: [CONTA],
      publicada_em: new Date(AGORA - (i + 1) * 3_600_000 * 0.5).toISOString(),
    }));
    const { db } = bancoFalso({ vencidas: [vencida("p1")], feitas });
    const r = await entregarVencidas(db, AGORA);
    expect(r.entregues).toBe(0);
    expect(r.adiadas).toBe(1);
    expect(socialRequest).not.toHaveBeenCalled();
  });

  it("não publica se perdeu a trava (cancelada ou outro processo)", async () => {
    socialRequest.mockReset();
    const { db } = bancoFalso({ vencidas: [vencida("p1")], trava: false });
    const r = await entregarVencidas(db, AGORA);
    expect(r.entregues).toBe(0);
    expect(socialRequest).not.toHaveBeenCalled();
  });

  it("erro do provedor volta para a fila e falha de vez na 3ª tentativa", async () => {
    socialRequest.mockReset();
    socialRequest.mockRejectedValue(new Error("boom"));
    const a = bancoFalso({ vencidas: [vencida("p1", { tentativas: 0 })] });
    await entregarVencidas(a.db, AGORA);
    expect(a.updates.at(-1)!.valores).toMatchObject({ status: "agendada", tentativas: 1 });
    const b = bancoFalso({ vencidas: [vencida("p1", { tentativas: 2 })] });
    const r = await entregarVencidas(b.db, AGORA);
    expect(b.updates.at(-1)!.valores).toMatchObject({ status: "falhou", tentativas: 3 });
    expect(r.falharam).toBe(1);
  });
});
