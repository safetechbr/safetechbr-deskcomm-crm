import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorker } from "tesseract.js";
import { lerDocumentoCliente } from "./ler-documento-cliente";

vi.mock("tesseract.js", () => ({ createWorker: vi.fn() }));

const foto = {
  size: 3,
  arrayBuffer: async () => new Uint8Array([255, 216, 255]).buffer,
} as File;
const texto = "NOME: CLIENTE EXEMPLO\nCPF: 529.982.247-25";
const leitor = () => ({
  recognize: vi.fn().mockResolvedValue({ data: { text: texto } }),
  terminate: vi.fn().mockResolvedValue(undefined),
});

describe("motor de leitura local", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 100, height: 100, close: vi.fn() }),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("usa apenas recursos locais, retorna campos permitidos e encerra o worker", async () => {
    const w = leitor();
    vi.mocked(createWorker).mockResolvedValue(
      w as unknown as Awaited<ReturnType<typeof createWorker>>,
    );
    const r = await lerDocumentoCliente(foto, new AbortController().signal, vi.fn());
    expect(r.dados).toEqual({ nome: "CLIENTE EXEMPLO", documento: "529.982.247-25" });
    expect(createWorker).toHaveBeenCalledWith(
      "por",
      1,
      expect.objectContaining({
        workerPath: "/ocr-cliente/worker.min.js",
        corePath: "/ocr-cliente",
        langPath: "/ocr-cliente",
        cacheMethod: "none",
        errorHandler: expect.any(Function),
      }),
    );
    expect(w.terminate).toHaveBeenCalledOnce();
    expect(createImageBitmap).toHaveBeenCalledWith(foto);
  });

  it("cancelar durante a inicialização descarta e encerra o worker que chegar depois", async () => {
    let inicializar!: (w: Awaited<ReturnType<typeof createWorker>>) => void;
    vi.mocked(createWorker).mockImplementation(
      () =>
        new Promise((r) => {
          inicializar = r;
        }),
    );
    const c = new AbortController();
    const p = lerDocumentoCliente(foto, c.signal, vi.fn());
    const rejeicao = expect(p).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(createWorker).toHaveBeenCalled());
    c.abort();
    await rejeicao;
    const w = leitor();
    inicializar(w as unknown as Awaited<ReturnType<typeof createWorker>>);
    await vi.waitFor(() => expect(w.terminate).toHaveBeenCalledOnce());
    expect(w.recognize).not.toHaveBeenCalled();
  });

  it("erro interno não devolve texto privado e também encerra o worker", async () => {
    const w = leitor();
    w.recognize.mockRejectedValue(new Error("texto privado do documento"));
    vi.mocked(createWorker).mockResolvedValue(
      w as unknown as Awaited<ReturnType<typeof createWorker>>,
    );
    await expect(lerDocumentoCliente(foto, new AbortController().signal, vi.fn())).rejects.toThrow(
      /^Não foi possível ler o documento/,
    );
    expect(w.terminate).toHaveBeenCalledOnce();
  });

  it("limita a espera por um OCR travado e permite retomar o preenchimento manual", async () => {
    vi.useFakeTimers();
    const w = leitor();
    w.recognize.mockImplementation(() => new Promise(() => undefined));
    vi.mocked(createWorker).mockResolvedValue(
      w as unknown as Awaited<ReturnType<typeof createWorker>>,
    );
    const p = lerDocumentoCliente(foto, new AbortController().signal, vi.fn());
    const rejeicao = expect(p).rejects.toThrow("A leitura demorou demais");
    await vi.waitFor(() => expect(w.recognize).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(120001);
    await rejeicao;
    expect(w.terminate).toHaveBeenCalledOnce();
  });
});
