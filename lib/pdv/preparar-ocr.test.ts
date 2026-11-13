// @vitest-environment node
import { mkdtempSync, writeFileSync, symlinkSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, it, expect } from "vitest";
import { prepararOcrDoCliente } from "./preparar-ocr";
import { isPublicPath } from "@/lib/auth/public-paths";

describe("leitor distribuído com a instalação", () => {
  it("prepara modelos e workers reais em instalação sem public e pode repetir sem reescrever", () => {
    const raiz = mkdtempSync(path.join(tmpdir(), "pdv-ocr-"));
    try {
      writeFileSync(path.join(raiz, "package.json"), "{}");
      symlinkSync(path.join(process.cwd(), "node_modules"), path.join(raiz, "node_modules"), "dir");
      prepararOcrDoCliente(raiz);
      const dir = path.join(raiz, "public/ocr-cliente");
      for (const nome of [
        "worker.min.js",
        "pdf.worker.min.mjs",
        "tesseract-core-lstm.wasm.js",
        "tesseract-core-lstm.wasm",
        "por.traineddata.gz",
        "LICENSE-tesseract.txt",
      ])
        expect(statSync(path.join(dir, nome)).size).toBeGreaterThan(1000);
      expect(readFileSync(path.join(dir, "tesseract-core-lstm.wasm")).subarray(0, 4)).toEqual(
        Buffer.from([0, 97, 115, 109]),
      );
      expect(gunzipSync(readFileSync(path.join(dir, "por.traineddata.gz"))).length).toBeGreaterThan(
        1000000,
      );
      const antes = statSync(path.join(dir, "worker.min.js")).mtimeMs;
      prepararOcrDoCliente(raiz);
      expect(statSync(path.join(dir, "worker.min.js")).mtimeMs).toBe(antes);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
  it("dispensa sessão somente para os recursos públicos do leitor, sem liberar documentos ou rotas", () => {
    for (const p of [
      "/ocr-cliente/por.traineddata.gz",
      "/ocr-cliente/pdf.worker.min.mjs",
      "/ocr-cliente/tesseract-core-simd-lstm.wasm",
    ])
      expect(isPublicPath(p)).toBe(true);
    for (const p of [
      "/ocr-cliente/cliente.pdf",
      "/ocr-cliente/uploads/a.pdf",
      "/ocr-cliente/../api/v1/contacts",
      "/ocr-cliente/api/v1/contacts",
    ])
      expect(isPublicPath(p)).toBe(false);
  });
});
