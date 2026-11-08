import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FunisClient, type FunilDaLista } from "@/app/app/kanban/_client";
import { useFunilPrincipalDaCentral } from "@/hooks/inbox/useFunilPrincipalDaCentral";
import { EVENTO_FUNIS_MUDARAM } from "@/hooks/pipelines/useFunisDoMenu";

const h = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), criar: vi.fn(), editar: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: h.get, patch: h.patch } }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useActiveOrg: () => ({ orgId: "org-1", role: "admin" }),
}));
vi.mock("@/hooks/pipelines/usePipelines", () => ({
  useCriarFunil: () => ({ mutate: h.criar, isPending: false }),
  useEditarFunil: () => ({ mutate: h.editar, isPending: false }),
  useArquivarFunil: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/app/app/kanban/_components/ImportarLeads", () => ({ ImportarLeads: () => null }));

const A: FunilDaLista = {
  id: "a",
  name: "Atendimento",
  slug: "atendimento",
  description: null,
  position: 1000,
  is_default: false,
};
const B: FunilDaLista = {
  id: "b",
  name: "Vendas",
  slug: "vendas",
  description: null,
  position: 2000,
  is_default: true,
};
let principal = A;
const resposta = () => ({
  data: {
    pipeline: { id: principal.id, name: principal.name },
    configurado: true,
    substituido: false,
  },
});

/** Mesmo consumidor da preferência usado pela aba da central, no mesmo cache. */
function ConsumidorDaCentral() {
  const q = useFunilPrincipalDaCentral("org-1");
  return <output data-testid="principal-na-central">{q.data?.pipeline?.id}</output>;
}

function montar(
  funis: FunilDaLista[] = [A, B],
  podeGerenciar = true,
  podeDefinirPrincipal = podeGerenciar,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tela = (lista: FunilDaLista[]) => (
    <QueryClientProvider client={client}>
      <FunisClient
        funis={lista}
        arquivados={[]}
        podeGerenciar={podeGerenciar}
        podeImportar={false}
        podeDefinirPrincipal={podeDefinirPrincipal}
      />
      <ConsumidorDaCentral />
    </QueryClientProvider>
  );
  const view = render(tela(funis));
  return { ...view, trocarLista: (lista: FunilDaLista[]) => view.rerender(tela(lista)) };
}

beforeEach(() => {
  vi.resetAllMocks();
  principal = A;
  h.get.mockImplementation(async () => resposta());
  h.patch.mockImplementation(async (_url: string, body: { pipeline_id: string }) => {
    principal = body.pipeline_id === B.id ? B : A;
    return resposta();
  });
});
afterEach(cleanup);

describe("principal da central em CRM → Funis", () => {
  it("identifica o principal efetivo sem confundir com o padrão de entrada", async () => {
    montar();
    expect(await screen.findByTestId("principal-central-a")).toHaveTextContent(
      "Principal da central",
    );
    expect(screen.queryByTestId("principal-central-b")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("funil-b")).getByText("Padrão")).toBeInTheDocument();
    expect(within(screen.getByTestId("funil-a")).queryByText("Padrão")).not.toBeInTheDocument();
  });

  it("cria outro funil, escolhe como principal e atualiza o consumidor da central", async () => {
    const user = userEvent.setup();
    h.criar.mockImplementation((_name, options) =>
      options.onSuccess({ data: { pipelines: [A, B], arquivados: [] } }),
    );
    montar([A]);
    await screen.findByTestId("principal-central-a");
    await user.click(screen.getByTestId("novo-funil"));
    await user.type(screen.getByTestId("nome-do-novo-funil"), B.name);
    await user.click(screen.getByTestId("confirmar-novo-funil"));
    await user.click(await screen.findByTestId("definir-principal-central-b"));
    await screen.findByTestId("principal-central-b");
    expect(screen.queryByTestId("principal-central-a")).not.toBeInTheDocument();
    expect(screen.getByTestId("principal-na-central")).toHaveTextContent("b");
    expect(h.patch).toHaveBeenCalledWith("/api/v1/settings/central", { pipeline_id: "b" });
    expect(h.editar).not.toHaveBeenCalled();
  });

  it("falha de gravação conserva a tag anterior e explica a recusa no quadro escolhido", async () => {
    const user = userEvent.setup();
    h.patch.mockRejectedValueOnce(new Error("A configuração mudou. Tente novamente."));
    montar();
    await screen.findByTestId("principal-central-a");
    await user.click(screen.getByTestId("definir-principal-central-b"));
    expect(await screen.findByTestId("erro-b")).toHaveTextContent(
      "A configuração mudou. Tente novamente.",
    );
    expect(screen.getByTestId("principal-central-a")).toBeInTheDocument();
    expect(screen.queryByTestId("principal-central-b")).not.toBeInTheDocument();
  });

  it("quem não gerencia vê a identificação e não recebe a ação de troca", async () => {
    montar([A, B], false);
    expect(await screen.findByTestId("principal-central-a")).toBeInTheDocument();
    expect(screen.queryByTestId("definir-principal-central-b")).not.toBeInTheDocument();
  });

  it("suporte somente leitura não recebe a ação mesmo com papel de gestão", async () => {
    montar([A, B], true, false);
    expect(await screen.findByTestId("principal-central-a")).toBeInTheDocument();
    expect(screen.queryByTestId("definir-principal-central-b")).not.toBeInTheDocument();
  });

  it("reavalia a identificação após arquivar ou mudar os funis", async () => {
    const view = montar();
    await screen.findByTestId("principal-central-a");
    principal = B;
    view.trocarLista([B]);
    act(() => window.dispatchEvent(new Event(EVENTO_FUNIS_MUDARAM)));
    await waitFor(() => expect(screen.getByTestId("principal-central-b")).toBeInTheDocument());
    expect(h.get).toHaveBeenCalledTimes(2);
  });

  it("falha de leitura oferece nova tentativa e não inventa uma identificação", async () => {
    const user = userEvent.setup();
    h.get.mockRejectedValueOnce(new Error("Sem rede"));
    montar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não consegui identificar");
    expect(screen.queryByTestId("principal-central-a")).not.toBeInTheDocument();
    expect(screen.getByTestId("definir-principal-central-b")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByTestId("principal-central-a")).toBeInTheDocument();
  });
});
