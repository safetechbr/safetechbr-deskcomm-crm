/** Áreas de imagens no PDF, em coordenadas de página. Não depende de modelo de CNH. */
export type AreaDoDocumento = [number, number, number, number];
type Matrix = [number, number, number, number, number, number];
export function areasDeImagens(
  ops: { fnArray: ArrayLike<number>; argsArray: unknown[][] },
  codigos: {
    save: number;
    restore: number;
    transform: number;
    paintImageXObject: number;
    paintInlineImageXObject: number;
  },
  pagina: AreaDoDocumento,
): AreaDoDocumento[] {
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  const pilha: Matrix[] = [];
  const areas: AreaDoDocumento[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const arg = ops.argsArray[i] ?? [];
    if (fn === codigos.save) pilha.push([...m]);
    else if (fn === codigos.restore) m = pilha.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === codigos.transform) {
      const [a, b, c, d, e, f] = arg as Matrix;
      const [A, B, C, D, E, F] = m;
      m = [
        A * a + C * b,
        B * a + D * b,
        A * c + C * d,
        B * c + D * d,
        A * e + C * f + E,
        B * e + D * f + F,
      ];
    } else if (fn === codigos.paintImageXObject || fn === codigos.paintInlineImageXObject) {
      const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
      const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
      const area: AreaDoDocumento = [
        Math.max(pagina[0], Math.min(...xs)),
        Math.max(pagina[1], Math.min(...ys)),
        Math.min(pagina[2], Math.max(...xs)),
        Math.min(pagina[3], Math.max(...ys)),
      ];
      const w = area[2] - area[0],
        h = area[3] - area[1];
      if (w > 60 && h > 40 && w * h > 3000) areas.push(area);
    }
  }
  // QR quadrado não ganha prioridade sobre cartão/folha; limita trabalho por arquivo.
  return areas
    .filter((a, i) => areas.findIndex((b) => a.every((v, j) => Math.abs(v - b[j]!) < 1)) === i)
    .sort((a, b) => {
      const score = (r: AreaDoDocumento) => {
        const w = r[2] - r[0],
          h = r[3] - r[1];
        return w * h * (Math.abs(w / h - 1) < 0.12 ? 0.1 : 1);
      };
      const diferenca = score(b) - score(a);
      return Math.abs(diferenca) < Math.max(score(a), score(b)) * 0.01 ? b[3] - a[3] : diferenca;
    })
    .slice(0, 4);
}

/** Quadro logo abaixo do rótulo REGISTRO; coordenadas do TSV do próprio OCR. */
export function quadrosDeRegistro(tsv: string, largura: number, altura: number) {
  return tsv
    .split("\n")
    .flatMap((linha) => {
      const colunas = linha.split("\t");
      if (colunas[0] !== "5" || !/REGISTRO/i.test(colunas[11] ?? "")) return [];
      const [x, y, w, h] = colunas.slice(6, 10).map(Number);
      if (![x, y, w, h].every(Number.isFinite) || w! <= 0 || h! <= 0) return [];
      const esquerda = Math.max(0, x! - w! * 0.8),
        topo = Math.max(0, y! + h! * 0.8);
      const larguraRecorte = Math.min(largura - esquerda, w! * 2.8),
        alturaRecorte = Math.min(altura - topo, h! * 4);
      return larguraRecorte > 0 && alturaRecorte > 0
        ? [{ x: esquerda, y: topo, w: larguraRecorte, h: alturaRecorte }]
        : [];
    })
    .slice(0, 2);
}

/** Linha do nome abaixo do rótulo, limitada pelo campo de habilitação ao lado. */
export function quadrosDeNome(tsv: string, largura: number, altura: number) {
  const palavras = tsv.split("\n").flatMap((l) => {
    const c = l.split("\t");
    const [x, y, w, h] = c.slice(6, 10).map(Number);
    return c[0] === "5" && [x, y, w, h].every(Number.isFinite) && w! > 0 && h! > 0
      ? [{ texto: c[11] ?? "", x: x!, y: y!, w: w!, h: h! }]
      : [];
  });
  const nomes = palavras.filter((p) => /^(?:NOME|N0ME)$/i.test(p.texto));
  const rotulos = nomes.length ? nomes : palavras.filter((p) => /^SOBRENOME$/i.test(p.texto));
  return rotulos.slice(0, 2).flatMap((p) => {
    const x = Math.max(0, p.x - (nomes.length ? p.h * 3 : p.w * 2));
    const y = p.y + p.h;
    const vizinho = palavras
      .filter((v) => /HABILITA/i.test(v.texto) && Math.abs(v.y - p.y) < p.h * 2 && v.x > p.x)
      .sort((a, b) => a.x - b.x)[0];
    const fim = vizinho ? Math.min(largura, vizinho.x - p.h * 2) : largura;
    const w = fim - x,
      h = Math.min(altura - y, p.h * 3.2);
    return w > 0 && h > 0 ? [{ x, y, w, h }] : [];
  });
}

/** Envelope das três linhas mecânicas; evita ler a legenda junto do código. */
export function quadroDaZonaMecanica(tsv: string, largura: number, altura: number) {
  const palavras = tsv.split("\n").flatMap((l) => {
    const c = l.split("\t");
    const [x, y, w, h] = c.slice(6, 10).map(Number);
    return c[0] === "5" &&
      (c[11]?.match(/</g)?.length ?? 0) >= 3 &&
      [x, y, w, h].every(Number.isFinite) &&
      w! > 0 &&
      h! > 0
      ? [{ x: x!, y: y!, w: w!, h: h! }]
      : [];
  });
  if (palavras.length < 3) return;
  const pad = Math.min(...palavras.map((p) => p.h)) * 0.25;
  const x = Math.max(0, Math.min(...palavras.map((p) => p.x)) - pad),
    y = Math.max(0, Math.min(...palavras.map((p) => p.y)) - pad);
  const fimX = Math.min(largura, Math.max(...palavras.map((p) => p.x + p.w)) + pad),
    fimY = Math.min(altura, Math.max(...palavras.map((p) => p.y + p.h)) + pad);
  return { x, y, w: fimX - x, h: fimY - y };
}
