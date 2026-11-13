"use client";
import {
  areasDeImagens,
  quadroDaZonaMecanica,
  quadrosDeNome,
  quadrosDeRegistro,
  type AreaDoDocumento,
} from "./areas-do-documento";
import type { Worker } from "tesseract.js";
import {
  nomeDaZonaMecanica,
  interpretarComprovante,
  interpretarDocumento,
  type LeituraDoDocumento,
} from "./dados-do-documento";
export const MAXIMO_DOCUMENTO_BYTES = 10 * 1024 * 1024;
export const MAXIMO_PAGINAS_DOCUMENTO = 4;
const cancelado = () => new DOMException("Leitura cancelada", "AbortError");
export function validarArquivoDocumento(arquivo: Pick<File, "size">) {
  if (!arquivo.size) throw new Error("O arquivo está vazio.");
  if (arquivo.size > MAXIMO_DOCUMENTO_BYTES) throw new Error("Envie um documento de até 10 MB.");
}
export function tipoDoDocumento(bytes: Uint8Array): "imagem" | "pdf" {
  if (String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return "pdf";
  if (
    (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) ||
    (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP")
  )
    return "imagem";
  throw new Error("Formato não suportado. Envie uma foto JPG, PNG, WebP ou um PDF.");
}
/** Toda a leitura é local. O arquivo e o texto bruto não são enviados nem persistidos. */
export async function lerDocumentoCliente(
  arquivo: File,
  signal: AbortSignal,
  progresso: (texto: string) => void,
  tipo: "identidade" | "residencia" = "identidade",
): Promise<LeituraDoDocumento> {
  validarArquivoDocumento(arquivo);
  const interpretar = tipo === "residencia" ? interpretarComprovante : interpretarDocumento;
  let nomePrecisouDeFoco = false;
  let nomeMecanico: { nome: string; cnh: string; nascimento: string } | undefined;
  let worker: Worker | undefined;
  let encerrado = false;
  let destruirPdf: (() => Promise<void>) | undefined;
  const controlador = new AbortController();
  const cancelar = () => controlador.abort();
  signal.addEventListener("abort", cancelar, { once: true });
  if (signal.aborted) cancelar();
  const tempo = setTimeout(cancelar, 120000);
  function aguardar<T>(p: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const abortar = () =>
        reject(
          signal.aborted
            ? cancelado()
            : new Error("A leitura demorou demais. Tente uma foto mais nítida ou menor."),
        );
      if (controlador.signal.aborted) {
        p.catch(() => undefined);
        abortar();
        return;
      }
      controlador.signal.addEventListener("abort", abortar, { once: true });
      p.then(resolve, reject)
        .finally(() => controlador.signal.removeEventListener("abort", abortar))
        .catch(() => undefined);
    });
  }
  async function reconhecer(canvas: HTMLCanvasElement) {
    if (!worker) {
      progresso("Preparando leitura do documento…");
      const { createWorker } = await import("tesseract.js");
      worker = await aguardar(
        createWorker("por", 1, {
          workerPath: "/ocr-cliente/worker.min.js",
          corePath: "/ocr-cliente",
          langPath: "/ocr-cliente",
          workerBlobURL: false,
          cacheMethod: "none",
          // A biblioteca também lança erros no evento do worker por padrão.
          // O Promise é tratado abaixo, sem publicar texto bruto em logs/Sentry.
          errorHandler: () => undefined,
          logger: (m) => {
            if (m.status === "recognizing text")
              progresso(`Lendo documento… ${Math.round(m.progress * 100)}%`);
          },
        }).then((w) => {
          if (encerrado) {
            void w.terminate();
            throw cancelado();
          }
          worker = w;
          return w;
        }),
      );
    }
    const leitor = worker;
    if (!leitor) throw new Error("Não foi possível preparar a leitura.");
    const resultado = await aguardar(
      leitor.recognize(canvas, { rotateAuto: true }, { text: true, tsv: true }),
    );
    let texto = resultado.data.text;
    const dados = interpretar(texto).dados;
    const alinhado = Math.abs(resultado.data.rotateRadians ?? 0) < 0.05;
    if (tipo === "identidade" && dados.documento && resultado.data.tsv && alinhado) {
      const { PSM } = await import("tesseract.js");
      async function lerQuadro(
        quadro: { x: number; y: number; w: number; h: number },
        numerico: boolean,
      ) {
        const recorte = document.createElement("canvas");
        recorte.width = Math.ceil(quadro.w * 2);
        recorte.height = Math.ceil(quadro.h * 2);
        try {
          recorte
            .getContext("2d")!
            .drawImage(
              canvas,
              quadro.x,
              quadro.y,
              quadro.w,
              quadro.h,
              0,
              0,
              recorte.width,
              recorte.height,
            );
          await aguardar(
            leitor!.setParameters({
              tessedit_pageseg_mode: numerico ? PSM.SINGLE_LINE : PSM.SINGLE_BLOCK,
              tessedit_char_whitelist: numerico ? "0123456789" : "",
            }),
          );
          return (await aguardar(leitor!.recognize(recorte))).data.text.trim();
        } finally {
          recorte.width = 0;
          recorte.height = 0;
          if (!controlador.signal.aborted)
            await aguardar(
              leitor!.setParameters({
                tessedit_pageseg_mode: PSM.AUTO,
                tessedit_char_whitelist: "",
              }),
            );
        }
      }
      if (!dados.nome) {
        nomePrecisouDeFoco = true;
        for (const quadro of quadrosDeNome(resultado.data.tsv, canvas.width, canvas.height)) {
          progresso("Lendo nome completo…");
          const nome = (await lerQuadro(quadro, false)).replace(/[|\[\]]/g, "").trim();
          const identificado = interpretarDocumento("NOME: " + nome).dados.nome;
          if (identificado) {
            texto += "\nNOME: " + identificado;
            break;
          }
        }
      }
      if (!dados.cnh) {
        for (const quadro of quadrosDeRegistro(resultado.data.tsv, canvas.width, canvas.height)) {
          const numeros = await lerQuadro(quadro, true);
          if (/^\d{11}$/.test(numeros)) {
            texto += "\nCNH: " + numeros;
            break;
          }
        }
      }
    }

    if (
      tipo === "identidade" &&
      nomePrecisouDeFoco &&
      resultado.data.tsv &&
      alinhado &&
      /[I1]\s*<\s*BRA/i.test(texto)
    ) {
      const quadro = quadroDaZonaMecanica(resultado.data.tsv, canvas.width, canvas.height);
      if (quadro) {
        const { PSM } = await import("tesseract.js");
        const recorte = document.createElement("canvas");
        recorte.width = Math.ceil(quadro.w * 2);
        recorte.height = Math.ceil(quadro.h * 2);
        try {
          recorte
            .getContext("2d")!
            .drawImage(
              canvas,
              quadro.x,
              quadro.y,
              quadro.w,
              quadro.h,
              0,
              0,
              recorte.width,
              recorte.height,
            );
          await aguardar(
            leitor.setParameters({
              tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
              tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
            }),
          );
          texto += "\n" + (await aguardar(leitor.recognize(recorte))).data.text;
        } finally {
          recorte.width = 0;
          recorte.height = 0;
          if (!controlador.signal.aborted)
            await aguardar(
              leitor.setParameters({
                tessedit_pageseg_mode: PSM.AUTO,
                tessedit_char_whitelist: "",
              }),
            );
        }
      }
    }
    return texto;
  }
  try {
    progresso("Abrindo documento…");
    const bytes = new Uint8Array(await aguardar(arquivo.arrayBuffer()));
    const formato = tipoDoDocumento(bytes);
    let texto = "";
    if (formato === "imagem") {
      const bitmap = await aguardar(createImageBitmap(arquivo));
      const canvas = document.createElement("canvas");
      try {
        if (bitmap.width * bitmap.height > 24000000)
          throw new Error("A imagem é muito grande. Envie uma foto com resolução menor.");
        const escala = Math.min(2, 2200 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.round(bitmap.width * escala);
        canvas.height = Math.round(bitmap.height * escala);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Não foi possível abrir a imagem.");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        texto = await reconhecer(canvas);
      } finally {
        bitmap.close();
        canvas.width = 0;
        canvas.height = 0;
      }
    } else {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/ocr-cliente/pdf.worker.min.mjs";
      const tarefa = pdfjs.getDocument({
        data: bytes,
        disableFontFace: true,
        useSystemFonts: true,
      });
      destruirPdf = () => tarefa.destroy();
      const pdf = await aguardar(tarefa.promise);
      if (pdf.numPages > MAXIMO_PAGINAS_DOCUMENTO)
        throw new Error("Envie somente as páginas do documento, em um PDF de até 4 páginas.");
      for (let i = 1; i <= pdf.numPages; i++) {
        progresso(`Lendo página ${i} de ${pdf.numPages}…`);
        const pagina = await aguardar(pdf.getPage(i));
        try {
          const conteudo = await aguardar(pagina.getTextContent());
          let anterior: number | undefined;
          const linhas: string[] = [];
          for (const item of conteudo.items)
            if ("str" in item) {
              const y = item.transform[5] as number;
              if (anterior !== undefined && Math.abs(anterior - y) > 3) linhas.push("\n");
              linhas.push(item.str + " ");
              if (item.hasEOL) linhas.push("\n");
              anterior = y;
            }
          let t = linhas.join("");
          // Mesmo PDF digital pode conter o documento somente como fotografia.
          if (
            t.trim().length < 50 ||
            !(tipo === "residencia"
              ? interpretar(t).dados.endereco
              : interpretar(t).dados.documento)
          ) {
            const operadores = await aguardar(pagina.getOperatorList());
            const areas =
              tipo === "identidade"
                ? areasDeImagens(operadores, pdfjs.OPS, pagina.view as AreaDoDocumento)
                : [];
            const recortes: AreaDoDocumento[] = [];
            for (const area of areas) {
              const w = area[2] - area[0],
                h = area[3] - area[1];
              // CNH-e pode reunir frente, verso e código de leitura numa imagem vertical.
              if (h > w * 1.5)
                recortes.push([area[0], area[3] - Math.min(h, w * 0.85), area[2], area[3]]);
              recortes.push(area);
            }
            if (!recortes.length) recortes.push(pagina.view as AreaDoDocumento);
            let lido = "";
            for (const area of recortes.slice(0, 5)) {
              const escala = Math.min(8, 2400 / Math.max(area[2] - area[0], area[3] - area[1]));
              const viewport = pagina.getViewport({ scale: escala });
              const pontos = [
                ...viewport.convertToViewportPoint(area[0], area[1]),
                ...viewport.convertToViewportPoint(area[2], area[3]),
              ];
              const x = Math.floor(Math.min(pontos[0]!, pontos[2]!)),
                y = Math.floor(Math.min(pontos[1]!, pontos[3]!));
              const canvas = document.createElement("canvas");
              canvas.width = Math.ceil(Math.abs(pontos[2]! - pontos[0]!));
              canvas.height = Math.ceil(Math.abs(pontos[3]! - pontos[1]!));
              try {
                progresso("Lendo área do documento…");
                await aguardar(
                  pagina.render({ canvas, viewport, transform: [1, 0, 0, 1, -x, -y] }).promise,
                );
                const trecho = await reconhecer(canvas);
                // Textos de QR, instruções e versão em vários idiomas não substituem a frente.
                const resultado = interpretar(trecho);
                if (nomePrecisouDeFoco) {
                  const base = interpretar(lido).dados;
                  const nome = nomeDaZonaMecanica(trecho, base);
                  if (nome && base.cnh && base.nascimento)
                    nomeMecanico = { nome, cnh: base.cnh, nascimento: base.nascimento };
                }
                if (
                  Object.keys(resultado.dados).length > Object.keys(interpretar(lido).dados).length
                )
                  lido = trecho;
                if (
                  !nomePrecisouDeFoco &&
                  resultado.dados.nome &&
                  resultado.dados.documento &&
                  resultado.dados.nascimento &&
                  resultado.dados.rg &&
                  resultado.dados.cnh
                )
                  break;
                if (nomeMecanico) break;
              } finally {
                canvas.width = 0;
                canvas.height = 0;
              }
            }
            t = lido;
          }
          texto += "\n" + t.slice(0, 50000);
        } finally {
          pagina.cleanup();
        }
      }
    }
    if (controlador.signal.aborted) throw cancelado();
    const resultado = interpretar(texto);
    if (nomePrecisouDeFoco) {
      const nome = nomeDaZonaMecanica(texto, resultado.dados);
      if (nome) resultado.dados.nome = nome;
      else if (
        nomeMecanico &&
        nomeMecanico.cnh === resultado.dados.cnh &&
        nomeMecanico.nascimento === resultado.dados.nascimento
      )
        resultado.dados.nome = nomeMecanico.nome;
    }
    return resultado;
  } catch (e) {
    if (signal.aborted) throw cancelado();
    if (controlador.signal.aborted)
      throw new Error("A leitura demorou demais. Tente uma foto mais nítida ou menor.");
    // Não devolve erros internos que possam conter bytes ou texto do documento.
    if (e instanceof Error && /^(Envie |O arquivo |Formato |A imagem )/.test(e.message)) throw e;
    throw new Error(
      "Não foi possível ler o documento. Tente uma imagem mais nítida, sem reflexos, ou preencha os dados manualmente.",
    );
  } finally {
    encerrado = true;
    clearTimeout(tempo);
    signal.removeEventListener("abort", cancelar);
    await worker?.terminate().catch(() => undefined);
    await destruirPdf?.().catch(() => undefined);
  }
}
