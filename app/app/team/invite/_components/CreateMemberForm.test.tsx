import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateMemberForm } from "./CreateMemberForm";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/lib/api/client", () => ({ apiClient: { post: vi.fn() } }));

function montar() {
  render(<QueryClientProvider client={new QueryClient()}><CreateMemberForm /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("Nome do vendedor"), { target: { value: "João" } });
  fireEvent.change(screen.getByLabelText("Login"), { target: { value: "Joao" } });
  fireEvent.change(screen.getByLabelText("Senha do vendedor"), { target: { value: "Teste123!" } });
}

describe("cadastro de vendedor sem e-mail", () => {
  beforeEach(() => vi.clearAllMocks());
  it("envia login normalizado, papel e interface e limpa a senha após criar", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { username: "joao" } });
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Criar vendedor" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("joao"));
    expect(apiClient.post).toHaveBeenCalledWith("/api/v1/team/create", expect.objectContaining({ username: "joao", role: "agent", interface_settings: { preset: "simplificada" } }));
    expect(screen.getByLabelText("Senha do vendedor")).toHaveValue("");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });
  it("explica login duplicado sem indicar sucesso", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new ApiError(409, "state_conflict", undefined, "teste", "Este login já está em uso."));
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Criar vendedor" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Este login já está em uso."));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar vendedor" })).toBeEnabled();
  });
});
