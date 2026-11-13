import { describe, it, expect } from "vitest";
import {
  areasDeImagens,
  quadrosDeRegistro,
  quadrosDeNome,
  quadroDaZonaMecanica,
} from "./areas-do-documento";
const ops = { save: 1, restore: 2, transform: 3, paintImageXObject: 4, paintInlineImageXObject: 5 };
describe("áreas de leitura em PDF com CNH e QR", () => {
  it("aplica transformações e restaura estado, priorizando cartão e topo", () => {
    const a = areasDeImagens(
      {
        fnArray: [1, 3, 4, 2, 1, 3, 4, 2, 1, 3, 4, 2],
        argsArray: [
          [],
          [240, 0, 0, 170, 30, 400],
          ["verso"],
          [],
          [],
          [240, 0, 0, 170, 30, 600],
          ["frente"],
          [],
          [],
          [220, 0, 0, 220, 320, 500],
          ["qr"],
          [],
        ],
      },
      ops,
      [0, 0, 600, 850],
    );
    expect(a).toEqual([
      [30, 600, 270, 770],
      [30, 400, 270, 570],
      [320, 500, 540, 720],
    ]);
  });
  it("ignora logotipos pequenos, limita áreas e não duplica imagem repetida", () => {
    expect(
      areasDeImagens(
        {
          fnArray: [1, 3, 4, 4, 2, 1, 3, 4, 2],
          argsArray: [
            [],
            [240, 0, 0, 170, 30, 600],
            ["frente"],
            ["frente"],
            [],
            [],
            [20, 0, 0, 20, 0, 0],
            ["logo"],
            [],
          ],
        },
        ops,
        [0, 0, 600, 850],
      ),
    ).toHaveLength(1);
  });
  it("recorta registro a partir do rótulo reconhecido e respeita bordas", () => {
    const tsv = "5\t1\t1\t1\t1\t1\t300\t200\t100\t20\t90\tREGISTRO";
    expect(quadrosDeRegistro(tsv, 500, 300)).toEqual([{ x: 220, y: 216, w: 280, h: 80 }]);
    expect(quadrosDeRegistro(tsv.replace("300", "NaN"), 500, 300)).toEqual([]);
  });
});

it("limita a leitura do nome pelo quadro vizinho da primeira habilitação", () => {
  const tsv =
    "5\t1\t1\t1\t1\t1\t100\t40\t45\t10\t90\tNOME\n5\t1\t1\t1\t1\t2\t400\t41\t100\t10\t90\tHABILITACAO";
  expect(quadrosDeNome(tsv, 600, 400)).toEqual([{ x: 70, y: 50, w: 310, h: 32 }]);
  expect(quadroDaZonaMecanica(tsv, 600, 400)).toBeUndefined();
});
