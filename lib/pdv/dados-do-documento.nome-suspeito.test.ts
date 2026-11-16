import { describe, expect, it } from "vitest";
import { nomeSuspeito } from "./dados-do-documento";

describe("nomeSuspeito", () => {
  it("marca letras perdidas pelo OCR", () => {
    expect(nomeSuspeito("EI EL OLIVEIRA SANTOS JUNIOR")).toBe(true);
  });
  it("aceita nomes e partículas comuns", () => {
    expect(nomeSuspeito("JEIEL OLIVEIRA SANTOS JUNIOR")).toBe(false);
    expect(nomeSuspeito("MARIA DA SILVA E SOUZA")).toBe(false);
    expect(nomeSuspeito(undefined)).toBe(false);
  });
});

import { interpretarDocumento } from "./dados-do-documento";
describe("nome ao lado de outro campo na CNH-e", () => {
  it("ignora a data da 1ª habilitação colada após '['", () => {
    const r = interpretarDocumento(
      "2 é 1 NOME E SOBRENOME 1º HABILITAÇÃO\n[ JEIEL OLIVEIRA SANTOS JUNIOR [ 15/02/2019\n3 DATA, LOCAL E UF DE NASCIMENTO",
    );
    expect(r.dados.nome).toBe("JEIEL OLIVEIRA SANTOS JUNIOR");
  });
});
