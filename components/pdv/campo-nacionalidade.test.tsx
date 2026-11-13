import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CampoNacionalidade } from "./campo-nacionalidade";
import { NACIONALIDADES, sugerirNacionalidades } from "@/lib/contacts/nacionalidades";
function Campo() {
  const [v, set] = useState("");
  return <CampoNacionalidade valor={v} onChange={set} className="" />;
}
describe("nacionalidades com busca", () => {
  it("começa vazio e seleciona Brasileiro digitando bra, sem submeter o formulário", () => {
    render(<Campo />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveValue("");
    fireEvent.change(input, { target: { value: "bra" } });
    expect(screen.getByRole("option", { name: "Brasileiro" })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("Brasileiro");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("seleciona outra nacionalidade sem distinguir acentos ou caixa", () => {
    render(<Campo />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "PORTUG" } });
    fireEvent.click(screen.getByRole("option", { name: "Português" }));
    expect(input).toHaveValue("Português");
    expect(sugerirNacionalidades("jap")[0]?.nome).toBe("Japonês");
  });
  it("catálogo abrangente sem valores duplicados", () => {
    expect(NACIONALIDADES.length).toBeGreaterThanOrEqual(195);
    expect(new Set(NACIONALIDADES.map((n) => n.nome)).size).toBe(NACIONALIDADES.length);
  });
});
