import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeReplace = vi.hoisted(() => vi.fn());

const contexto = vi.hoisted(() => ({
  org: "org-a" as string | null,
  pedidos: [] as { org: string | null; numero: string | null }[],
}));

const get = vi.fn(async (bruta?: string): Promise<unknown> => {
  const url = bruta ?? "";
  if (url.startsWith("/api/v1/conversations?")) {
    contexto.pedidos.push({ org: contexto.org, numero: new URLSearchParams(url.split("?")[1]).get("channel_session_id") });
    return { data: [], meta: { has_more: false } };
  }
  if (url === "/api/v1/ai/automatico-ativo") return { data: { ativo: false } };
  if (url === "/api/v1/conversations/counts") return { data: {} };
  return { data: [] };
});

vi.mock("@/lib/api/client", () => ({ apiClient: { get: (url: string) => get(url) } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({
  prepareRealtimeAuthentication: vi.fn().mockResolvedValue(undefined),
  createClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inbox",
  useRouter: () => ({ replace: routeReplace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "u-1", role: "admin" },
    activeOrg: contexto.org ? { orgId: contexto.org } : null,
  }),
  usePermission: () => true,
}));
vi.mock("@/hooks/inbox/useMarkAsRead", () => ({ useMarkAsRead: () => undefined }));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useCloseConversation", () => ({
  useCloseConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/components/inbox/InboxFilters", () => ({
  InboxFilters: ({ value, onChange }: {
    value: { tab: string; channel_session_id?: string; onlyUnread?: boolean };
    onChange: (v: unknown) => void;
  }) => <>
    <input aria-label="Estado da lista preservado" defaultValue="" />
    <output data-testid="filtros">{JSON.stringify(value)}</output>
    <button onClick={() => onChange({ ...value, channel_session_id: `numero-${contexto.org}`, onlyUnread: true })}>Lembrar número</button>
    <button onClick={() => onChange({ ...value, channel_session_id: undefined, onlyUnread: false })}>Desligar</button>
  </>,
}));
vi.mock("@/components/inbox/ConversationList", () => ({ ConversationList: () => null }));
vi.mock("@/components/inbox/CRMSidePanel", () => ({ CRMSidePanel: () => null }));
vi.mock("@/components/inbox/ChatThread", () => ({ ChatThread: () => null }));
vi.mock("@/components/inbox/Composer", () => ({ Composer: () => null }));
vi.mock("@/components/inbox/ConversationHeader", () => ({ ConversationHeader: () => null }));
vi.mock("@/components/inbox/RetentionNotice", () => ({ RetentionNotice: () => null }));
vi.mock("@/components/inbox/InboxKeyboardShortcuts", () => ({
  InboxKeyboardShortcuts: () => <span data-testid="atalhos-inbox" />,
}));
vi.mock("@/components/inbox/ShortcutsHelpDialog", () => ({ ShortcutsHelpDialog: () => null }));
vi.mock("@/components/inbox/JanelaFechadaAviso", () => ({ JanelaFechadaAviso: () => null }));

vi.mock("@/components/inbox/FunilNaCentral", () => ({
  FunilNaCentral: ({ pipelineId }: { pipelineId: string | null }) => <div data-testid="quadro-central">{pipelineId ?? "principal"}</div>,
}));

import { InboxLayout } from "@/components/inbox/InboxLayout";


import { CHAVE_DOS_FILTROS, lerFiltrosLembrados } from "@/lib/inbox/filtros-lembrados";

const A = { channel_session_id: "numero-org-a", onlyUnread: true };
const B = { channel_session_id: "numero-org-b" };

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tela = () => <QueryClientProvider client={client}><InboxLayout /></QueryClientProvider>;
  const view = render(tela());
  return {
    mudarOrg(org: string | null) { contexto.org = org; view.rerender(tela()); },
    mudarUrl(url: string) { window.history.replaceState({}, "", url); view.rerender(tela()); },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  routeReplace.mockClear();
  contexto.org = "org-a";
  contexto.pedidos = [];
  localStorage.clear();
  localStorage.setItem(CHAVE_DOS_FILTROS, JSON.stringify({ "org-a": A, "org-b": B }));
});

describe("os efeitos do Inbox preservam a memória do contexto", () => {
  it("restaurar nunca grava o valor inicial por cima da preferência lembrada", async () => {
    const gravar = vi.spyOn(Storage.prototype, "setItem");
    montar();
    await waitFor(() => expect(screen.getByTestId("filtros")).toHaveTextContent("numero-org-a"));
    const escritas = gravar.mock.calls.filter(([chave]) => chave === CHAVE_DOS_FILTROS);
    expect(escritas.length).toBeGreaterThan(0);
    for (const [, valor] of escritas) expect(JSON.parse(valor)["org-a"]).toEqual(A);
  });

  it("trocar A/B/A e passar por contexto ausente não grava o número anterior na nova organização", async () => {
    const view = montar();
    await waitFor(() => expect(screen.getByTestId("filtros")).toHaveTextContent("numero-org-a"));
    const gravar = vi.spyOn(Storage.prototype, "setItem");
    view.mudarOrg("org-b");
    await waitFor(() => expect(screen.getByTestId("filtros")).toHaveTextContent("numero-org-b"));
    expect(contexto.pedidos.filter((p) => p.org === "org-b").some((p) => p.numero === "numero-org-a")).toBe(false);
    for (const [, valor] of gravar.mock.calls.filter(([chave]) => chave === CHAVE_DOS_FILTROS)) {
      expect(JSON.parse(valor)["org-b"]).toEqual(B);
    }
    view.mudarOrg(null);
    view.mudarOrg("org-a");
    await waitFor(() => expect(screen.getByTestId("filtros")).toHaveTextContent("numero-org-a"));
    expect(lerFiltrosLembrados(localStorage, "org-b")).toEqual(B);
    view.mudarOrg("org-b");
    view.mudarOrg("org-a");
    expect(screen.getByTestId("filtros")).toHaveTextContent("numero-org-a");
    expect(lerFiltrosLembrados(localStorage, "org-b")).toEqual(B);
  });

  it("desligar persiste sem apagar a preferência da outra organização", async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId("filtros")).toHaveTextContent("numero-org-a"));
    fireEvent.click(screen.getByRole("button", { name: "Desligar" }));
    await waitFor(() => expect(lerFiltrosLembrados(localStorage, "org-a")).toEqual({}));
    expect(lerFiltrosLembrados(localStorage, "org-b")).toEqual(B);
  });

  it("storage bloqueado permite escolher os filtros para a visita", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("bloqueado"); } });
    try {
      montar();
      fireEvent.click(screen.getByRole("button", { name: "Lembrar número" }));
      expect(screen.getByTestId("filtros")).toHaveTextContent("numero-org-a");
    } finally {
      Object.defineProperty(window, "localStorage", descriptor);
    }
  });
});


describe("navegação entre as seções da central", () => {
  it("ir para Conversas preserva o ID aberto e os filtros de trabalho", async () => {
    window.history.replaceState({}, "", "/app/inbox?filter=mine&id=conversa-1&tag=vip");
    try {
      montar();
      await waitFor(() => expect(screen.getByTestId("filtros")).toHaveTextContent("numero-org-a"));
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Conversas" }), { button: 0, ctrlKey: false });
      const destino = routeReplace.mock.calls.at(-1)?.[0] as string;
      const params = new URL(destino, "http://localhost").searchParams;
      expect(params.get("filter")).toBe("all");
      expect(params.get("id")).toBe("conversa-1");
      expect(params.get("tag")).toBe("vip");
      expect(screen.getByTestId("filtros")).toHaveTextContent("numero-org-a");
      expect(screen.getByTestId("filtros")).toHaveTextContent('"onlyUnread":true');
    } finally {
      window.history.replaceState({}, "", "/");
    }
  });
});


it("o funil ocupa a central sem desmontar o trabalho da lista nem ativar atalhos ocultos", async () => {
  window.history.replaceState({}, "", "/app/inbox?filter=mine&id=conversa-1&tag=vip");
  try {
    const view = montar();
    const input = screen.getByLabelText("Estado da lista preservado");
    fireEvent.change(input, { target: { value: "trabalho em andamento" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Funil principal" }), { button: 0, ctrlKey: false });
    const destino = routeReplace.mock.calls.at(-1)?.[0] as string;
    expect(new URL(destino, "http://localhost").searchParams.get("id")).toBe("conversa-1");
    view.mudarUrl(destino);
    expect(await screen.findByTestId("quadro-central")).toHaveTextContent("principal");
    expect(screen.queryByTestId("atalhos-inbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Estado da lista preservado")).toBe(input);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "A fazer" }), { button: 0, ctrlKey: false });
    const retorno = routeReplace.mock.calls.at(-1)?.[0] as string;
    const params = new URL(retorno, "http://localhost").searchParams;
    expect(params.get("visao")).toBeNull();
    expect(params.get("filter")).toBe("mine");
    expect(params.get("id")).toBe("conversa-1");
    expect(params.get("tag")).toBe("vip");
    view.mudarUrl(retorno);
    expect(screen.getByTestId("atalhos-inbox")).toBeInTheDocument();
    expect(screen.getByLabelText("Estado da lista preservado")).toHaveValue("trabalho em andamento");
  } finally { window.history.replaceState({}, "", "/"); }
});


it("alternar funil e conversas e trocar a empresa não repete chaves entre componentes irmãos", async () => {
  const erros = vi.spyOn(console, "error").mockImplementation(() => {});
  window.history.replaceState({}, "", "/app/inbox?filter=all&visao=funil");
  try {
    const view = montar();
    await screen.findByTestId("quadro-central");
    for (const org of ["org-a", "org-b", "org-a"]) {
      view.mudarOrg(org);
      view.mudarUrl("/app/inbox?filter=all");
      view.mudarUrl("/app/inbox?filter=all&visao=funil");
      expect(await screen.findByTestId("quadro-central")).toHaveTextContent("principal");
      expect(screen.getAllByRole("tab", { name: "Funil principal" })).toHaveLength(1);
      expect(screen.getAllByTestId("quadro-central")).toHaveLength(1);
    }
    expect(erros.mock.calls.filter((args) => args.some((arg) =>
      typeof arg === "string" && arg.includes("Encountered two children with the same key")
    ))).toEqual([]);
  } finally {
    window.history.replaceState({}, "", "/");
    erros.mockRestore();
  }
});
