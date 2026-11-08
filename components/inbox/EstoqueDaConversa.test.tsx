import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EstoqueDaConversa } from "./EstoqueDaConversa";

const get = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", () => ({
  apiClient: { get, post: vi.fn() },
}));
vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EstoqueDaConversa conversationId="c1" />
    </QueryClientProvider>,
  );
}

describe("EstoqueDaConversa", () => {
  beforeEach(() => {
    localStorage.clear();
    get.mockReset();
    get.mockResolvedValue({ data: [] });
  });

  it("começa recolhido e não busca o estoque", () => {
    montar();
    expect(screen.getByTestId("estoque-da-conversa-alternar")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(get).not.toHaveBeenCalled();
  });

  it("abre ao clicar e guarda a escolha", async () => {
    montar();
    await userEvent.click(screen.getByTestId("estoque-da-conversa-alternar"));
    expect(screen.getByTestId("estoque-da-conversa-alternar")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(localStorage.getItem("deskcomm:inbox:estoque-da-conversa:recolhido")).toBe("0");
  });
});
