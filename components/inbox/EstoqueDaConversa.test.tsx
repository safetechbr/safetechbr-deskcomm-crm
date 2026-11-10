import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EstoqueDaConversa } from "./EstoqueDaConversa";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", () => ({
  apiClient: { get, post },
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useUser: () => ({ id: "u1" }), useActiveOrg: () => ({ orgId: "o1", role: "agent" }) }));
vi.mock("@/hooks/realtime/useRealtimeChannel", () => ({ useRealtimeChannel: () => ({ status: "subscribed" }) }));
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

const carro = { id: "v1", codigo: "001", marca: "Fiat", modelo: "Pulse", fotos: [], preco_cents: 8900000, moeda: "BRL", status: "disponivel" };
const reserva = { id: "r1", veiculo_id: "v1", vendedor_user_id: "u2", vendedor_nome: "Ana", expira_em: new Date(Date.now()+86400000).toISOString(), encerrada_em: null };
describe("reserva visível no atendimento", () => {
  it("outro vendedor vê nome e prazo, mas não pode enviar nem tomar a reserva", async () => {
    localStorage.clear(); get.mockResolvedValue({ data: [{ ...carro, reserva }] });
    montar(); await userEvent.click(screen.getByTestId("estoque-da-conversa-alternar"));
    expect(await screen.findByText(/Reservado por Ana/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Enviar$/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Reservar para visita" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Liberar reserva" })).not.toBeInTheDocument();
  });
  it("responsável ainda envia e pode devolver à equipe", async () => {
    localStorage.clear(); get.mockResolvedValue({ data: [{ ...carro, reserva: { ...reserva, vendedor_user_id: "u1" } }] });
    montar(); await userEvent.click(screen.getByTestId("estoque-da-conversa-alternar"));
    expect(await screen.findByRole("button", { name: "Liberar reserva" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Enviar$/ })).toBeEnabled();
  });
  it("oferece reserva com padrão de 24h sem enviar mensagem", async () => {
    localStorage.clear(); get.mockResolvedValue({ data: [carro] }); post.mockClear();
    montar(); await userEvent.click(screen.getByTestId("estoque-da-conversa-alternar"));
    await userEvent.click(await screen.findByRole("button", { name: "Reservar para visita" }));
    expect(screen.getByRole("spinbutton")).toHaveValue(24);
    expect(post).not.toHaveBeenCalled();
  });
});
