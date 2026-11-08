import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FunilNaCentral } from "@/components/inbox/FunilNaCentral";

const h = vi.hoisted(() => ({
  role: "manager",
  readonly: false,
  principal: {
    pipeline: { id: "vendas", name: "Vendas" },
    configurado: true,
    substituido: false,
  } as {
    pipeline: { id: string; name: string } | null;
    configurado: boolean;
    substituido: boolean;
  },
  erro: false,
  mutate: vi.fn(),
  refetch: vi.fn(),
  board: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    activeOrg: { orgId: "org-1", role: h.role },
    user: { support: h.readonly ? { access_mode: "support_readonly" } : null },
  }),
}));
vi.mock("@/hooks/inbox/useFunilPrincipalDaCentral", () => ({
  useFunilPrincipalDaCentral: () => ({
    data: h.erro ? undefined : h.principal,
    isError: h.erro,
    isSuccess: !h.erro,
    refetch: h.refetch,
  }),
  useDefinirFunilPrincipalDaCentral: () => ({ mutate: h.mutate, isPending: false }),
}));
vi.mock("@/hooks/kanban/useBoard", () => ({
  useBoard: (id: string) => {
    h.board(id);
    return {
      data: {
        pipeline: { id, name: id, settings: {}, vocabulary: null },
        stages: [{ id: "etapa-1" }],
        leads: [],
      },
      isLoading: false,
      error: null,
      refetch: h.refetch,
      pulses: new Map(),
      realtimeStatus: "SUBSCRIBED",
      seguranca: { divergencias: 0 },
    };
  },
}));
vi.mock("@/components/kanban/KanbanBoard", () => ({
  KanbanBoard: ({ pipelineId }: { pipelineId: string }) => (
    <div data-testid="quadro">{pipelineId}</div>
  ),
}));
vi.mock("@/components/kanban/FilterBar", () => ({ FilterBar: () => null }));
vi.mock("@/components/kanban/BulkActionBar", () => ({ BulkActionBar: () => null }));
vi.mock("@/components/kanban/NewLeadDialog", () => ({ NewLeadDialog: () => null }));
vi.mock("sonner", () => ({ toast: { success: h.toast, error: h.toast } }));

beforeEach(() => {
  vi.clearAllMocks();
  h.role = "manager";
  h.readonly = false;
  h.erro = false;
  h.principal = {
    pipeline: { id: "vendas", name: "Vendas" },
    configurado: true,
    substituido: false,
  };
});
afterEach(cleanup);

describe("quadro embutido na central", () => {
  it("usa o principal salvo e permite consultar outro quadro sem alterar essa preferência", () => {
    const view = render(<FunilNaCentral pipelineId={null} onPrincipalDefinido={() => {}} />);
    expect(screen.getByTestId("quadro")).toHaveTextContent("vendas");
    expect(screen.getByRole("link", { name: /Configurar colunas de/ })).toHaveAttribute(
      "href",
      "/app/settings/tenant/pipelines#etapas-vendas",
    );
    view.rerender(<FunilNaCentral pipelineId="pos-venda" onPrincipalDefinido={() => {}} />);
    expect(screen.getByTestId("quadro")).toHaveTextContent("pos-venda");
    expect(screen.getByRole("link", { name: /Configurar colunas de/ })).toHaveAttribute(
      "href",
      "/app/settings/tenant/pipelines#etapas-pos-venda",
    );
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("gestor pode fixar o quadro escolhido e só volta ao principal depois do sucesso", () => {
    const onPrincipalDefinido = vi.fn();
    render(<FunilNaCentral pipelineId="pos-venda" onPrincipalDefinido={onPrincipalDefinido} />);
    fireEvent.click(screen.getByRole("button", { name: "Definir como principal" }));
    expect(h.mutate).toHaveBeenCalledWith("pos-venda", expect.any(Object));
    expect(onPrincipalDefinido).not.toHaveBeenCalled();
    h.mutate.mock.calls[0]![1].onSuccess();
    expect(onPrincipalDefinido).toHaveBeenCalledOnce();
  });

  it("recusa de gravação mostra a mensagem e mantém o quadro escolhido", () => {
    const onPrincipalDefinido = vi.fn();
    render(<FunilNaCentral pipelineId="pos-venda" onPrincipalDefinido={onPrincipalDefinido} />);
    fireEvent.click(screen.getByRole("button", { name: "Definir como principal" }));
    h.mutate.mock.calls[0]![1].onError(new Error("A configuração mudou. Tente novamente."));
    expect(h.toast).toHaveBeenCalledWith("A configuração mudou. Tente novamente.");
    expect(onPrincipalDefinido).not.toHaveBeenCalled();
    expect(screen.getByTestId("quadro")).toHaveTextContent("pos-venda");
  });

  it.each(["agent", "viewer"])("%s não recebe a configuração de principal", (role) => {
    h.role = role;
    render(<FunilNaCentral pipelineId="pos-venda" onPrincipalDefinido={() => {}} />);
    expect(
      screen.queryByRole("button", { name: "Definir como principal" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("quadro")).toHaveTextContent("pos-venda");
    expect(screen.queryByRole("link", { name: /Configurar colunas de/ })).not.toBeInTheDocument();
  });

  it("suporte somente leitura não configura nem cria negócio", () => {
    h.readonly = true;
    render(<FunilNaCentral pipelineId="pos-venda" onPrincipalDefinido={() => {}} />);
    expect(
      screen.queryByRole("button", { name: "Definir como principal" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Novo Lead" })).not.toBeInTheDocument();
  });

  it("ausência de funis e falha de leitura têm saídas explícitas", () => {
    h.principal.pipeline = null;
    const view = render(<FunilNaCentral pipelineId={null} onPrincipalDefinido={() => {}} />);
    expect(screen.getByRole("link", { name: "Gerenciar funis" })).toHaveAttribute(
      "href",
      "/app/kanban",
    );
    expect(h.board).not.toHaveBeenCalled();
    h.erro = true;
    view.rerender(<FunilNaCentral pipelineId={null} onPrincipalDefinido={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(h.refetch).toHaveBeenCalledOnce();
  });
});
