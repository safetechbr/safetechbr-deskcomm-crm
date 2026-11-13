import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EstoqueDaConversa } from "./EstoqueDaConversa";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
const send = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", () => ({
  apiClient: { get, post },
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useUser: () => ({ id: "u1" }), useActiveOrg: () => ({ orgId: "o1", role: "agent" }) }));
vi.mock("@/hooks/realtime/useRealtimeChannel", () => ({ useRealtimeChannel: () => ({ status: "subscribed" }) }));
vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutateAsync: send }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

function montar(conversationId = "c1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EstoqueDaConversa conversationId={conversationId} />
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

function adiar<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((r, e) => { resolve = r; reject = e; });
  return { promise, resolve, reject };
}

describe("envio sem bloquear a janela", () => {
  beforeEach(() => {
    localStorage.clear();
    get.mockReset().mockResolvedValue({ data: [carro] });
    post.mockReset(); send.mockReset().mockResolvedValue({ data: {} });
  });
  it("fecha a revisão antes de terminar a preparação e mantém o envio após recolher", async () => {
    const preparando = adiar<{ data: { itens: Array<{ type: string; body: string }>; fotos_faltando: number } }>();
    post.mockImplementation((_url: string, body: { previa?: boolean }) => body.previa
      ? Promise.resolve({ data: { itens: [{ body: "Ficha revisável" }] } })
      : preparando.promise);
    montar();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("estoque-da-conversa-alternar"));
    await user.click(screen.getByRole("button", { name: "Só ficha" }));
    await user.click(await screen.findByRole("button", { name: /^Enviar$/ }));
    const dialogo = await screen.findByRole("dialog");
    const campo = within(dialogo).getByTestId("ficha-editavel");
    await user.clear(campo); await user.type(campo, "Texto aprovado pelo vendedor");
    await user.click(within(dialogo).getByRole("button", { name: "Enviar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(send).not.toHaveBeenCalled();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1]![1]).toMatchObject({ conversation_id: "c1", modo: "ficha", texto: "Texto aprovado pelo vendedor" });
    await user.click(screen.getByTestId("estoque-da-conversa-alternar"));
    await user.click(screen.getByTestId("estoque-da-conversa-alternar"));
    expect(await screen.findByRole("button", { name: "Enviando…" })).toBeDisabled();
    await act(async () => preparando.resolve({ data: { itens: [{ type: "text", body: "Texto aprovado pelo vendedor" }], fotos_faltando: 0 } }));
    await waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ conversation_id: "c1", body: "Texto aprovado pelo vendedor" })));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Enviar$/ })).toBeEnabled());
  });
});
