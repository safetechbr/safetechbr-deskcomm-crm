import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { alterarAtendimento } from "@/lib/atendimento/servidor";
import { ApiError } from "@/lib/api/types";
import { audit } from "@/lib/audit";
import { registrarTrocaDeComando } from "@/lib/inbox/atividade-de-comando";
import { sincronizarNegocioAbertoDoContato } from "@/lib/inbox/negocio-aberto-do-contato";
import { assumirConversaComEfeitos } from "./assumir-conversa";

vi.mock("@/lib/atendimento/servidor", () => ({ alterarAtendimento: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/inbox/atividade-de-comando", () => ({
  registrarTrocaDeComando: vi.fn(async () => undefined),
}));
vi.mock("@/lib/inbox/negocio-aberto-do-contato", () => ({
  sincronizarNegocioAbertoDoContato: vi.fn(async () => ({
    gravou: true,
    motivo: "sincronizado",
    abertos: 1,
    leadId: "negocio",
  })),
}));

const entrada = {
  organizationId: "org-a",
  conversationId: "conversa-a",
  actor: { type: "user" as const, id: "atendente-a", role: "agent" },
  requestId: "requisicao",
};
const conversa = {
  id: "conversa-a",
  organization_id: "org-a",
  contact_id: "contato-a",
  assigned_to_user_id: "atendente-a",
};

function banco(resultados: Array<{ data: unknown; error: { message: string } | null }>) {
  const rpc = vi.fn(async (nome: string, _params: unknown) =>
    nome === "fn_conversation_assign" ? resultados.shift()! : { data: null, error: null },
  );
  return { cliente: { rpc } as unknown as SupabaseClient, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(alterarAtendimento).mockReset();
});

describe("assumir compartilha os efeitos canônicos", () => {
  it("abertura vencedora e claim posterior sem linhas deixam os efeitos uma única vez", async () => {
    const { cliente, rpc } = banco([
      { data: [conversa], error: null },
      { data: [], error: null },
    ]);
    vi.mocked(alterarAtendimento)
      .mockResolvedValueOnce({
        conversation: conversa as never,
        dono_user_id: entrada.actor.id,
        antes: null,
        autorizado_por_senha: false,
      })
      .mockResolvedValueOnce({
        conversation: null,
        dono_user_id: entrada.actor.id,
        antes: null,
        autorizado_por_senha: false,
      });
    expect((await assumirConversaComEfeitos(cliente, entrada)).conversation).toEqual(conversa);
    expect((await assumirConversaComEfeitos(cliente, entrada)).conversation).toBeNull();
    expect(sincronizarNegocioAbertoDoContato).toHaveBeenCalledExactlyOnceWith(cliente, {
      organizationId: "org-a",
      contactId: "contato-a",
      toUserId: "atendente-a",
      soSemResponsavel: true,
    });
    expect(audit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: "conversation.claimed",
        actorUserId: "atendente-a",
        organizationId: "org-a",
        resourceId: "conversa-a",
        metadata: {
          negocio_aberto: "sincronizado",
          negocio_id: "negocio",
          autorizado_por_senha: false,
        },
      }),
    );
    expect(registrarTrocaDeComando).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        supabase: cliente,
        organizationId: "org-a",
        conversationId: "conversa-a",
        contactId: "contato-a",
        actor: entrada.actor,
      }),
    );
    expect(rpc.mock.calls.filter(([nome]) => nome === "emit_event")).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith(
      "emit_event",
      expect.objectContaining({ p_organization_id: "org-a", p_entity_id: "conversa-a" }),
    );
  });

  it("recusa de senha não emite efeitos", async () => {
    const { cliente, rpc } = banco([]);
    vi.mocked(alterarAtendimento).mockRejectedValue(
      new ApiError(403, "atendimento_senha_incorreta", undefined, "", "Senha incorreta"),
    );
    await expect(assumirConversaComEfeitos(cliente, entrada)).rejects.toThrow("Senha incorreta");
    expect(audit).not.toHaveBeenCalled();
    expect(registrarTrocaDeComando).not.toHaveBeenCalled();
    expect(sincronizarNegocioAbertoDoContato).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("encaminha senha e responsável esperado ao portão transacional", async () => {
    const { cliente } = banco([]);
    vi.mocked(alterarAtendimento).mockResolvedValue({
      conversation: conversa as never,
      dono_user_id: entrada.actor.id,
      antes: "dono-anterior",
      autorizado_por_senha: true,
    });
    await assumirConversaComEfeitos(cliente, {
      ...entrada,
      expectedAssignee: "dono-anterior",
      senha: "SenhaTeste123",
    });
    expect(alterarAtendimento).toHaveBeenCalledWith({
      orgId: entrada.organizationId,
      actorId: entrada.actor.id,
      conversationId: entrada.conversationId,
      acao: "assumir",
      expected: "dono-anterior",
      senha: "SenhaTeste123",
    });
  });
});
