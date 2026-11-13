// @vitest-environment node
/** Ensaio opcional de motor real; nunca inclui documentos pessoais no repositório. */
import { createRequire } from "node:module";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { it, expect, vi } from "vitest";
const req = createRequire(path.join(process.cwd(), "package.json"));
// Inicializa o adaptador Node antes dos objetos mínimos de DOM do ensaio.
req("tesseract.js");
vi.mock("pdfjs-dist", async () => {
  const r = createRequire(path.join(process.cwd(), "package.json"));
  const cr = createRequire(r.resolve("pdfjs-dist/package.json"));
  const { DOMMatrix, ImageData, Path2D } = cr("@napi-rs/canvas");
  Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
  const pdf = await import(r.resolve("pdfjs-dist/legacy/build/pdf.mjs"));
  return {
    ...pdf,
    GlobalWorkerOptions: {
      set workerSrc(_v: string) {
        /* worker Node do próprio pacote */
      },
    },
  };
});
vi.mock("tesseract.js", () => {
  const r = createRequire(path.join(process.cwd(), "package.json"));
  const real = r("tesseract.js");
  return {
    ...real,
    createWorker: async (lang: string, oem: number, options: Record<string, unknown>) => {
      const janela = globalThis.window;
      Reflect.deleteProperty(globalThis, "window");
      let w;
      try {
        w = await real.createWorker(lang, oem, {
          langPath: path.resolve("public/ocr-cliente"),
          cacheMethod: "none",
          logger: options.logger,
          errorHandler: () => undefined,
        });
      } finally {
        Object.assign(globalThis, { window: janela });
      }
      return {
        ...w,
        recognize: (c: { toBuffer: (f: string) => Buffer }, ...args: unknown[]) =>
          w.recognize(c.toBuffer("image/png"), ...args).then((r: { data: { text: string } }) => {
            // Controle de falha: mantém TSV real e força a leitura específica do nome.
            if (
              process.env.DOCUMENTO_FORCAR_LEITURA_DO_NOME &&
              (args[1] as { tsv?: boolean } | undefined)?.tsv
            )
              r.data.text = r.data.text.replace(/^.*NOME.*$/gim, "");
            return r;
          }),
      };
    },
  };
});
import { lerDocumentoCliente } from "./ler-documento-cliente";
it.skipIf(!process.env.DOCUMENTO_REAL_VALIDACAO)(
  "leitor real extrai os campos do PDF fornecido, sem salvar cadastro",
  async () => {
    const cr = createRequire(req.resolve("pdfjs-dist/package.json"));
    const { createCanvas } = cr("@napi-rs/canvas");
    vi.stubGlobal("document", {
      baseURI: "http://localhost/",
      createElement: () => createCanvas(1, 1),
    });
    vi.stubGlobal("window", {
      location: { href: "http://localhost/", origin: "http://localhost" },
      requestAnimationFrame: (f: () => void) => setTimeout(f, 0),
      cancelAnimationFrame: clearTimeout,
    });
    try {
      const bytes = await readFile(process.env.DOCUMENTO_REAL_VALIDACAO!);
      const tipo =
        process.env.DOCUMENTO_TIPO_VALIDACAO === "residencia" ? "residencia" : "identidade";
      const resultado = await lerDocumentoCliente(
        new File([bytes], "documento.pdf", { type: "application/pdf" }),
        new AbortController().signal,
        () => undefined,
        tipo,
      );
      expect(Object.keys(resultado.dados).sort()).toEqual(
        tipo === "residencia"
          ? ["bairro", "cep", "cidade", "endereco", "numero", "uf"]
          : ["cnh", "documento", "nascimento", "nome", "rg"],
      );
      expect(resultado.avisos).toEqual([]);
      // Confere referência humana privada, se fornecida; a asserção não imprime os valores.
      if (process.env.DOCUMENTO_REFERENCIA_PRIVADA) {
        const esperado = JSON.parse(
          await readFile(process.env.DOCUMENTO_REFERENCIA_PRIVADA, "utf8"),
        );
        for (const campo of Object.keys(esperado))
          expect(
            resultado.dados[campo as keyof typeof resultado.dados] === esperado[campo],
            `Conferência do campo ${campo}`,
          ).toBe(true);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  },
  120000,
);
