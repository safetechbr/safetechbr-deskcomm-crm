import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavegacaoDaCentral } from "@/components/inbox/NavegacaoDaCentral";

const menu = vi.hoisted(() => ({
  funis: [{ id: "funil-vendas", name: "Vendas", is_default: true }],
}));
vi.mock("@/hooks/pipelines/useFunisDoMenu", () => ({
  useFunisDoMenu: () => menu.funis,
}));

afterEach(cleanup);

describe("atalhos da central", () => {
  it("permite voltar do histórico ao trabalho pendente", () => {
    const onChange = vi.fn();
    render(<NavegacaoDaCentral visao="conversas" onChange={onChange} onSelectFunil={() => {}} />);
    expect(screen.getByRole("tab", { name: "Conversas" })).toHaveAttribute("aria-selected", "true");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "A fazer" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(onChange).toHaveBeenCalledWith("tarefas");
  });

  it("o principal é uma aba e os outros quadros transicionam na mesma central", async () => {
    const onChange = vi.fn();
    const onSelectFunil = vi.fn();
    render(
      <NavegacaoDaCentral visao="tarefas" onChange={onChange} onSelectFunil={onSelectFunil} />,
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Funil principal" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(onChange).toHaveBeenCalledWith("funil");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Abrir outros funis" }), {
      button: 0,
      ctrlKey: false,
    });
    const funil = await screen.findByRole("menuitem", { name: "Vendas" });
    expect(funil).not.toHaveAttribute("href");
    expect(funil).not.toHaveAttribute("target");
    fireEvent.click(funil);
    expect(onSelectFunil).toHaveBeenCalledWith("funil-vendas");
  });

  it("mantém acesso à lista completa enquanto os nomes não estão disponíveis", async () => {
    const anteriores = menu.funis;
    menu.funis = [];
    try {
      render(<NavegacaoDaCentral visao="tarefas" onChange={() => {}} onSelectFunil={() => {}} />);
      fireEvent.pointerDown(screen.getByRole("button", { name: "Abrir outros funis" }), {
        button: 0,
        ctrlKey: false,
      });
      expect(await screen.findByRole("menuitem", { name: /Gerenciar funis/ })).toHaveAttribute(
        "href",
        "/app/kanban",
      );
    } finally {
      menu.funis = anteriores;
    }
  });
});
