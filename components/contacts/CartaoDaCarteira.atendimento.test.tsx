import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, it, expect, vi } from "vitest";
import { CartaoDaCarteira } from "./CartaoDaCarteira";
import { ApiError } from "@/lib/api/types";
const ctx = vi.hoisted(() => ({ dono: null as string | null, post: vi.fn() }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "vendedor-a", support: null } }),
}));
vi.mock("@/hooks/contacts/useCarteiraDoContato", () => ({
  useCarteiraDoContato: () => ({
    data: { dono_user_id: ctx.dono, qualificado: !!ctx.dono },
    isError: false,
  }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({
    data: [
      { user_id: "vendedor-a", full_name: "Ana" },
      { user_id: "vendedor-b", full_name: "Bruno" },
    ],
  }),
}));
vi.mock("@/lib/api/client", () => ({
  apiClient: { post: (...args: unknown[]) => ctx.post(...args) },
}));
beforeEach(() => {
  ctx.dono = null;
  ctx.post.mockReset().mockResolvedValue({ data: {} });
});
function montar(papel = "agent") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CartaoDaCarteira
        contactId="cliente"
        papelDoUsuario={papel}
        conversationId="conversa"
        assignedTo={ctx.dono}
      />
    </QueryClientProvider>,
  );
}
it("assume em um clique usando a sessão, sem escolher outro vendedor", async () => {
  const user = userEvent.setup();
  montar();
  await user.click(screen.getByRole("button", { name: "Assumir atendimento" }));
  await waitFor(() =>
    expect(ctx.post).toHaveBeenCalledWith("/api/v1/contacts/cliente/atendimento", {
      acao: "assumir",
      conversation_id: "conversa",
      expected_assignee: null,
    }),
  );
  expect(screen.queryByRole("combobox")).toBeNull();
});
it("mostra a etiqueta do vendedor e permite liberar o próprio atendimento", async () => {
  ctx.dono = "vendedor-a";
  const user = userEvent.setup();
  montar();
  expect(screen.getByTestId("carteira-dono")).toHaveTextContent("Ana");
  await user.click(screen.getByRole("button", { name: "Liberar atendimento" }));
  await waitFor(() =>
    expect(ctx.post).toHaveBeenCalledWith("/api/v1/contacts/cliente/atendimento", {
      acao: "liberar",
      conversation_id: "conversa",
      expected_assignee: "vendedor-a",
    }),
  );
});
it("outro dono exige senha; erro preserva a identificação e limpa a senha", async () => {
  ctx.dono = "vendedor-b";
  ctx.post.mockRejectedValue(
    new ApiError(
      403,
      "atendimento_senha_incorreta",
      undefined,
      "",
      "Senha administrativa incorreta.",
    ),
  );
  const user = userEvent.setup();
  montar();
  await user.click(screen.getByRole("button", { name: "Assumir atendimento" }));
  expect(ctx.post).not.toHaveBeenCalled();
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByLabelText("Senha administrativa"), "Errada123");
  await user.click(within(dialog).getByRole("button", { name: "Assumir" }));
  await screen.findByRole("alert");
  expect(screen.getByTestId("carteira-dono")).toHaveTextContent("Bruno");
  expect(within(dialog).getByLabelText("Senha administrativa")).toHaveValue("");
});
it("viewer só vê a identificação", () => {
  ctx.dono = "vendedor-b";
  montar("viewer");
  expect(screen.getByTestId("carteira-dono")).toHaveTextContent("Bruno");
  expect(screen.queryByRole("button", { name: "Assumir atendimento" })).toBeNull();
});
