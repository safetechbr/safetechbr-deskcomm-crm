import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Veiculo } from "@/lib/veiculos/regras";
import { useEnvioDeVeiculo } from "./useEnvioDeVeiculo";
const ctx = vi.hoisted(() => ({
  post: vi.fn(),
  send: vi.fn(),
  loading: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { post: ctx.post } }));
vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutateAsync: ctx.send }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({
  toast: { loading: ctx.loading, success: ctx.success, error: ctx.error, warning: ctx.warning },
}));
const veiculo = { id: "v1", marca: "Fiat", modelo: "Pulse" } as Veiculo;
const pedido = { veiculo, modo: "completo" as const, comVideo: false, texto: "Ficha aprovada" };
const preparado = {
  data: { itens: [{ type: "text", body: "Ficha aprovada" }], fotos_faltando: 0 },
};
function adiar<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((r, e) => {
    resolve = r;
    reject = e;
  });
  return { promise, resolve, reject };
}
function contexto() {
  const qc = new QueryClient();
  return {
    qc,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  ctx.post.mockResolvedValue(preparado);
  ctx.send.mockResolvedValue({ data: {} });
});
it("continua após desmontar e mantém o destino original ao trocar de conversa", async () => {
  const preparando = adiar<typeof preparado>();
  ctx.post.mockReturnValue(preparando.promise);
  const { wrapper } = contexto();
  const tela = renderHook(() => useEnvioDeVeiculo("org", "c1"), { wrapper });
  act(() => tela.result.current.iniciar(pedido));
  await waitFor(() => expect(ctx.post).toHaveBeenCalledTimes(1));
  tela.unmount();
  const outra = renderHook(() => useEnvioDeVeiculo("org", "c2"), { wrapper });
  expect(outra.result.current.pendentes).toEqual([]);
  await act(async () => preparando.resolve(preparado));
  await waitFor(() =>
    expect(ctx.send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ conversation_id: "c1", body: "Ficha aprovada" }),
    ),
  );
  await waitFor(() => expect(ctx.success).toHaveBeenCalledTimes(1));
});
it("bloqueia repetição após remontar e enfileira outro veículo na mesma conversa", async () => {
  const primeiro = adiar<typeof preparado>();
  ctx.post.mockReturnValueOnce(primeiro.promise).mockResolvedValue(preparado);
  const { wrapper } = contexto();
  const a = renderHook(() => useEnvioDeVeiculo("org", "c1"), { wrapper });
  act(() => a.result.current.iniciar(pedido));
  await waitFor(() => expect(ctx.post).toHaveBeenCalledTimes(1));
  a.unmount();
  const b = renderHook(() => useEnvioDeVeiculo("org", "c1"), { wrapper });
  act(() => {
    b.result.current.iniciar(pedido);
    b.result.current.iniciar({ ...pedido, veiculo: { ...veiculo, id: "v2" } });
  });
  await waitFor(() => expect(b.result.current.pendentes).toHaveLength(2));
  expect(ctx.post).toHaveBeenCalledTimes(1);
  await act(async () => primeiro.resolve(preparado));
  await waitFor(() => expect(ctx.post).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(ctx.send).toHaveBeenCalledTimes(2));
  expect(ctx.post.mock.calls[0]![0]).toContain("/v1/");
  expect(ctx.post.mock.calls[1]![0]).toContain("/v2/");
});
it("preserva ordem das mídias e da ficha e só confirma após todos os itens", async () => {
  ctx.post.mockResolvedValue({
    data: {
      itens: [
        { type: "image", body: null, media_storage_path: "foto" },
        { type: "text", body: "Ficha" },
      ],
      fotos_faltando: 1,
    },
  });
  const ultimo = adiar<{ data: object }>();
  ctx.send.mockResolvedValueOnce({ data: {} }).mockReturnValueOnce(ultimo.promise);
  const { wrapper } = contexto();
  const tela = renderHook(() => useEnvioDeVeiculo("org", "c1"), { wrapper });
  act(() => tela.result.current.iniciar(pedido));
  await waitFor(() => expect(ctx.send).toHaveBeenCalledTimes(2), { timeout: 3000 });
  expect(ctx.send.mock.calls[0]![0].type).toBe("image");
  expect(ctx.send.mock.calls[1]![0].body).toBe("Ficha");
  expect(ctx.success).not.toHaveBeenCalled();
  await act(async () => ultimo.resolve({ data: {} }));
  await waitFor(() => expect(ctx.success).toHaveBeenCalledTimes(1));
  expect(ctx.warning).toHaveBeenCalledTimes(1);
});
it("falha interrompe o lote e avisa sem repetir automaticamente o que já saiu", async () => {
  ctx.post.mockResolvedValue({
    data: {
      itens: [
        { type: "image", body: null, media_storage_path: "foto" },
        { type: "text", body: "Ficha" },
      ],
      fotos_faltando: 0,
    },
  });
  ctx.send.mockRejectedValueOnce(new Error("Conexão indisponível"));
  const { wrapper } = contexto();
  const tela = renderHook(() => useEnvioDeVeiculo("org", "c1"), { wrapper });
  act(() => tela.result.current.iniciar(pedido));
  await waitFor(() => expect(ctx.error).toHaveBeenCalledTimes(1));
  expect(ctx.send).toHaveBeenCalledTimes(1);
  expect(ctx.success).not.toHaveBeenCalled();
  expect(ctx.error.mock.calls[0]![1].description).toContain("Confira o histórico");
});
