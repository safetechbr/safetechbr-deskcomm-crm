import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    fireEvent.change(screen.getByLabelText("Razão social"), {
      target: { value: "Loja nesta negociação" },
    });
    expect(screen.queryByText("Cliente no contrato")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cláusula especial"), {
      target: { value: "Texto desta operação" },
    });
    fireEvent.change(screen.getByLabelText("Tipo e chave PIX"), {
      target: { value: "Chave de teste" },
    });
    const r = JSON.parse(screen.getByTestId("resultado").textContent!);
    expect(r.contrato.empresa.razao_social).toBe("Loja nesta negociação");
    expect(r.contrato.clausula_especial).toBe("Texto desta operação");
    expect(r.cliente).toMatchObject({ nome: "Cliente Exemplo" });
    expect(r.pagamentos[0]).toMatchObject({ valor_cents: 100000, chave_pix: "Chave de teste" });
  });
  it("o bloqueio da negociação também bloqueia os campos novos", () => {
    render(<Formulario travado />);
    expect(screen.getByLabelText("Razão social")).toBeDisabled();
    expect(screen.getByLabelText("Cláusula especial")).toBeDisabled();
  });
});
