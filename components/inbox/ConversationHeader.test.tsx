import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConversationHeader } from "./ConversationHeader";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

/** O cabeçalho é só identidade/estado; as ações moraram em `AcoesDaConversa`. */
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", support: null } }),
}));
vi.mock("@/hooks/ai/useAutomaticoAtivo", () => ({
  useAutomaticoAtivo: () => ({ data: false }),
}));
vi.mock("@/components/kanban/OwnerBadge", () => ({ OwnerBadge: () => null }));
vi.mock("@/components/inbox/FaixaDaCarteira", () => ({ FaixaDaCarteira: () => null }));
vi.mock("@/components/inbox/JanelaSelo", () => ({ JanelaSelo: () => null }));
vi.mock("@/components/inbox/ChannelLogo", () => ({ ChannelLogo: () => null }));

function conversa(status: string): ConversationWithContact {
  return {
    id: "conv-1",
    organization_id: "org-1",
    contact_id: "contato-1",
    channel: "whatsapp",
    status,
    assigned_to_user_id: null,
    is_group: false,
    tags: [],
    metadata: {},
    contacts: null,
    channel_sessions: null,
  } as unknown as ConversationWithContact;
}

describe("ConversationHeader — enxuto", () => {
  it("não carrega botões de ação (moraram no painel lateral)", () => {
    render(<ConversationHeader conversation={conversa("open")} />);
    for (const nome of ["Assumir", "Fechar", "Arquivar", "Transferir", "Chamar"]) {
      expect(screen.queryByRole("button", { name: nome })).toBeNull();
    }
  });
});
