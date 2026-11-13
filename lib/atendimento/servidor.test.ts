import { beforeEach, it, expect, vi } from "vitest";
import { alterarAtendimento } from "./servidor";
const ctx = vi.hoisted(() => ({ rpc: vi.fn(), eq: vi.fn(), contact: "cliente" as string | null }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: ctx.rpc,
    from: () => {
      const b = {
        select: () => b,
        eq: (...args: unknown[]) => {
          ctx.eq(...args);
          return b;
        },
        maybeSingle: async () => ({ data: { contact_id: ctx.contact }, error: null }),
      };
      return b;
    },
  }),
}));
beforeEach(() => {
  ctx.contact = "cliente";
  ctx.eq.mockClear();
  ctx.rpc.mockReset().mockResolvedValue({
    data: {
      conversation: { id: "conversa" },
      dono_user_id: "vendedor",
      antes: null,
      autorizado_por_senha: false,
    },
    error: null,
  });
});
it("resolve cliente pela conversa da mesma empresa e usa identidade confiável", async () => {
  await alterarAtendimento({
    orgId: "empresa",
    actorId: "vendedor",
    conversationId: "conversa",
    acao: "assumir",
    senha: "SenhaTeste123",
    expected: "colega",
  });
  expect(ctx.eq).toHaveBeenCalledWith("organization_id", "empresa");
  expect(ctx.rpc).toHaveBeenCalledWith("fn_atendimento_alterar", {
    p_org: "empresa",
    p_actor: "vendedor",
    p_contact: "cliente",
    p_conversation: "conversa",
    p_acao: "assumir",
    p_senha: "SenhaTeste123",
    p_expected: "colega",
  });
});
it("traduz recusa de senha sem retornar o dado sensível", async () => {
  ctx.rpc.mockResolvedValue({ data: { erro: "senha_incorreta" }, error: null });
  await expect(
    alterarAtendimento({
      orgId: "empresa",
      actorId: "vendedor",
      contactId: "cliente",
      acao: "assumir",
      senha: "Errada123",
    }),
  ).rejects.toMatchObject({
    status: 403,
    code: "atendimento_senha_incorreta",
    message: "Senha administrativa incorreta.",
  });
});
it("limite persistido de tentativas vira HTTP 429", async () => {
  ctx.rpc.mockResolvedValue({ data: { erro: "tentativas_excedidas" }, error: null });
  await expect(
    alterarAtendimento({
      orgId: "empresa",
      actorId: "vendedor",
      contactId: "cliente",
      acao: "assumir",
    }),
  ).rejects.toMatchObject({ status: 429 });
});
