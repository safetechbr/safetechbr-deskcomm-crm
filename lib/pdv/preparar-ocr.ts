/** Assets do leitor local: publicados pelo build/dev, nunca por download do documento. */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
export function prepararOcrDoCliente(raiz = process.cwd()) {
  const require = createRequire(path.join(raiz, "package.json"));
  const pacote = (nome: string) => path.dirname(require.resolve(`${nome}/package.json`));
  const destino = path.join(raiz, "public/ocr-cliente");
  mkdirSync(destino, { recursive: true });
  function copiar(origem: string, nome: string) {
    const alvo = path.join(destino, nome);
    if (
      !existsSync(alvo) ||
      statSync(origem).mtimeMs > statSync(alvo).mtimeMs ||
      statSync(origem).size !== statSync(alvo).size
    )
      copyFileSync(origem, alvo);
  }
  const tess = pacote("tesseract.js");
  const core = path.dirname(
    createRequire(path.join(tess, "package.json")).resolve("tesseract.js-core/package.json"),
  );
  copiar(path.join(tess, "dist/worker.min.js"), "worker.min.js");
  for (const nome of readdirSync(core))
    if (/^tesseract-core.*\.(?:js|wasm)$/.test(nome)) copiar(path.join(core, nome), nome);
  const por = pacote("@tesseract.js-data/por");
  copiar(path.join(por, "4.0.0_best_int/por.traineddata.gz"), "por.traineddata.gz");
  const pdf = pacote("pdfjs-dist");
  copiar(path.join(pdf, "build/pdf.worker.min.mjs"), "pdf.worker.min.mjs");
  for (const [dir, nome] of [
    [tess, "LICENSE-tesseract.txt"],
    [core, "LICENSE-core.txt"],
    [pdf, "LICENSE-pdfjs.txt"],
    [por, "LICENSE-portugues.txt"],
  ]) {
    const original = ["LICENSE", "LICENSE.md"].map((f) => path.join(dir!, f)).find(existsSync);
    if (original) copiar(original, nome!);
  }
}
