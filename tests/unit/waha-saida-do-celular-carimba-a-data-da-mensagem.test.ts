import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { dispatchWahaEvent, type WahaEnvelope } from "@/lib/waha/ingest";

/**
 * A prévia da lista segue a ÚLTIMA mensagem de verdade.
 *
 * Ao reconectar, o aparelho entrega o que enviou enquanto o canal estava fora.
 * A saída era carimbada com "agora" (a entrada já usava o timestamp do canal),
 * então fala de ontem virava a última da conversa e escondia mensagens mais
 * novas. Entra pelo caminho de produção (`dispatchWahaEvent`).
 */
function admin() {
  const chamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const lista = {
    eq: () => lista,
    in: () => lista,
    neq: () => lista,
    is: () => lista,
    gte: () => lista,
    order: () => lista,
    limit: () => lista,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (r: (v: unknown) => unknown) => r({ data: [], error: null }),
  };
  const tabela = {
    insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: "msg-1" }, error: null }) }) }),
    update: () => lista,
    delete: () => lista,
    select: () => lista,
  };
  return {
    chamadas,
    admin: {
      from: () => tabela,
      rpc: async (fn: string, args: Record<string, unknown>) => {
        chamadas.push({ fn, args });
        if (fn === "fn_upsert_wa_contact") return { data: "contato-1", error: null };
        if (fn === "fn_upsert_wa_conversation") return { data: "conversa-1", error: null };
        return { data: null, error: null };
      },
    },
  };
}

describe("saída vinda do celular", () => {
  it("carimba a conversa com a data da mensagem, não com a de agora", async () => {
    const { admin: a, chamadas } = admin();
    const ts = 1_760_000_000; // 2025-10-09, bem antes de "agora"
    const env: WahaEnvelope = {
      event: "message.any",
      session: "default",
      payload: { id: "true_5511999@c.us_XYZ", from: "5511999999999@c.us", to: "5511999999999@c.us", fromMe: true, body: "oi", timestamp: ts },
    };
    await dispatchWahaEvent(a as never, { id: "s1", organization_id: "org-1" } as never, env, "req-1");
    const marca = chamadas.find((c) => c.fn === "fn_mark_conversation_message");
    expect(marca, "a conversa não foi carimbada").toBeDefined();
    expect(marca!.args.p_direction).toBe("outbound");
    expect(marca!.args.p_at).toBe(new Date(ts * 1000).toISOString());
  });
});
