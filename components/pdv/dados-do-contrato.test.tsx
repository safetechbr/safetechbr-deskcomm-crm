import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorDoContrato } from "./dados-do-contrato";
import { novoContrato } from "@/lib/pdv/modelo-contrato";
import type { ClienteDaNegociacao, PagamentoDaNegociacao } from "@/lib/pdv/regras";

function Formulario({ travado = false }: { travado?: boolean }) {
  const [contrato, setContrato] = useState(novoContrato({ legal_name: "Loja padrão" }));
  const [cliente] = useState<ClienteDaNegociacao>({ nome: "Cliente Exemplo" });
  const [pagamentos, setPagamentos] = useState<PagamentoDaNegociacao[]>([
    { forma: "pix", parcelas: 1, valor_cents: 100000 },
  ]);
  return (
    <fieldset disabled={travado}>
      <EditorDoContrato
        contrato={contrato}
        pagamentos={pagamentos}
        onChange={(d, p) => {
          setContrato(d);
          setPagamentos(p);
        }}
      />
      <output data-testid="resultado">{JSON.stringify({ contrato, cliente, pagamentos })}</output>
    </fieldset>
  );
}
describe("revisão do contrato no PDV", () => {
  it("editar a empresa não perde o comprador, a cláusula especial ou o pagamento", () => {
    render(<Formulario />);
    for (const setor of ["loja", "entrega", "contrato"]) {
      expect(screen.getByTestId(`pdv-setor-${setor}`)).not.toHaveAttribute("open");
    }
    fireEvent.click(screen.getByText("Loja (vendedora)", { selector: "summary" }));
    fireEvent.click(screen.getByText("Contrato", { selector: "summary" }));
    expect(screen.queryByLabelText("Cláusula especial")).not.toBeInTheDocument();
    expect(screen.queryByText("Detalhes contratuais dos pagamentos")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar condição especial" }));
    fireEvent.change(screen.getByLabelText("Razão social"), {
      target: { value: "Loja nesta negociação" },
    });
    expect(screen.queryByText("Cliente no contrato")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cláusula especial"), {
      target: { value: "Texto desta operação" },
    });
    const r = JSON.parse(screen.getByTestId("resultado").textContent!);
    expect(r.contrato.empresa.razao_social).toBe("Loja nesta negociação");
    expect(r.contrato.clausula_especial).toBe("Texto desta operação");
    expect(r.cliente).toMatchObject({ nome: "Cliente Exemplo" });
    expect(r.pagamentos[0]).toEqual({ forma: "pix", parcelas: 1, valor_cents: 100000 });
    fireEvent.click(screen.getByRole("button", { name: "Condição especial" }));
    expect(screen.queryByLabelText("Cláusula especial")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Condição especial" }));
    expect(screen.getByLabelText("Cláusula especial")).toHaveValue("Texto desta operação");
  });
  it("o bloqueio da negociação também bloqueia os campos novos", () => {
    render(<Formulario travado />);
    fireEvent.click(screen.getByText("Contrato", { selector: "summary" }));
    expect(screen.getByLabelText("Razão social")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Adicionar condição especial" })).toBeDisabled();
  });
  it("mostra só os detalhes aplicáveis e permite revisar dados antigos", () => {
    const contrato = novoContrato({ legal_name: "Loja padrão" });
    const pix: PagamentoDaNegociacao = { forma: "pix", parcelas: 1, valor_cents: 100000 };
    const financiamento: PagamentoDaNegociacao = { forma: "financiamento", parcelas: 12, valor_cents: 200000 };
    const onChange = vi.fn();
    const { rerender } = render(
      <EditorDoContrato contrato={contrato} pagamentos={[]} onChange={onChange} />,
    );
    expect(screen.queryByText("Detalhes contratuais dos pagamentos")).not.toBeInTheDocument();

    rerender(<EditorDoContrato contrato={contrato} pagamentos={[pix, financiamento]} onChange={onChange} />);
    fireEvent.click(screen.getByText("Contrato", { selector: "summary" }));
    const detalhes = screen.getByText("Detalhes contratuais dos pagamentos");
    fireEvent.click(detalhes);
    expect(screen.getByText("Pagamento 2 · Financiamento bancário")).toBeInTheDocument();
    expect(screen.queryByLabelText("Data de emissão")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Intervalo entre parcelas (dias)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tipo e chave PIX")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Data de pagamento / previsão"), {
      target: { value: "2026-12-20" },
    });
    expect(onChange).toHaveBeenCalledWith(contrato, [
      pix,
      { ...financiamento, data_pagamento: "2026-12-20" },
    ]);

    rerender(<EditorDoContrato contrato={contrato} pagamentos={[{ ...pix, chave_pix: "Chave antiga" }]} onChange={onChange} />);
    expect(within(detalhes.closest("details")!).getByLabelText("Tipo e chave PIX")).toHaveValue("Chave antiga");
  });
  it("loja incompleta mostra alerta com link para as configurações", () => {
    render(<Formulario />);
    fireEvent.click(screen.getByText("Loja (vendedora)", { selector: "summary" }));
    expect(screen.getByTestId("pdv-loja-alerta")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Configurações/ })).toHaveAttribute(
      "href",
      "/app/settings/tenant",
    );
  });
  it("loja completa recolhe em resumo e Editar reabre os campos", () => {
    const completa = novoContrato({
      legal_name: "Loja X",
      cnpj: "12.345.678/0001-90",
      dados_contrato: { endereco: "Rua A", numero: "1", cidade: "Recife", uf: "PE" },
    });
    render(<EditorDoContrato contrato={completa} pagamentos={[]} onChange={() => {}} />);
    fireEvent.click(screen.getByText("Loja (vendedora)", { selector: "summary" }));
    expect(screen.getByTestId("pdv-loja-resumo")).toHaveTextContent("Loja X");
    expect(screen.queryByLabelText("Razão social")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByLabelText("Razão social")).toBeInTheDocument();
  });
  it("Salvar como padrão chama o callback só quando ele é fornecido", async () => {
    const chamadas: unknown[] = [];
    render(
      <EditorDoContrato
        contrato={novoContrato({ legal_name: "Loja X" })}
        pagamentos={[]}
        onChange={() => {}}
        onSalvarPadrao={async (c) => {
          chamadas.push(c.empresa?.razao_social);
          return { ok: true };
        }}
      />,
    );
    fireEvent.click(screen.getByText("Loja (vendedora)", { selector: "summary" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar como padrão da loja" }));
    expect(await screen.findByText("Salvo como padrão da loja.")).toBeInTheDocument();
    expect(chamadas).toEqual(["Loja X"]);
  });
});
