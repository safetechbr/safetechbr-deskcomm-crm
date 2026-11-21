import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { guardarRascunho, limparRascunho } from "@/lib/pdv/rascunho-local";
import { vendaCompleta } from "@/tests/fixtures/negociacao-documentos";
import { PdvClient } from "./_client";

vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn().mockResolvedValue({ data: [] }) },
}));
vi.mock("@/lib/fiscal/ibge", () => ({ codigoIbgePorCep: vi.fn().mockResolvedValue("3550308") }));

const USUARIO = "teste-pdv-troca-fiscal";
afterEach(() => {
  limparRascunho(USUARIO);
  vi.unstubAllGlobals();
});

it("pede os dados fiscais da troca em Pagamento e reaproveita os do comprador", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
  const n = vendaCompleta();
  guardarRascunho(USUARIO, { aba: "venda", abertaId: null, r: { ...n, veiculo_id: null } });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PdvClient estoque={[]} urlsDasCapas={{}} negociacoesIniciais={[]} podeNegociar
        usuarioId={USUARIO} titulo="PDV" />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Recuperar" }));
  fireEvent.click(within(screen.getByTestId("pdv-bolinhas")).getByRole("button", { name: "Pagamento" }));
  fireEvent.click(screen.getByRole("button", { name: "Adicionar troca" }));
  const form = within(screen.getByTestId("pdv-troca"));
  expect(form.getByRole("heading", { name: "Dados para a NF-e de entrada" })).toBeVisible();
  expect(form.getByLabelText(/NCM do veículo/)).toHaveAttribute("aria-invalid", "true");
  expect(form.getByLabelText(/Data prevista de recebimento/)).toBeVisible();
  expect(form.getByLabelText(/^CPF/)).toHaveValue(n.cliente.documento);
  fireEvent.click(form.getByRole("checkbox", { name: "Usar dados do comprador" }));
  expect(form.getByLabelText(/^CPF/)).toHaveValue("");
  fireEvent.change(form.getByLabelText(/^CEP/), { target: { value: "01310-100" } });
  expect(await form.findByDisplayValue("3550308")).toBeVisible();
});
