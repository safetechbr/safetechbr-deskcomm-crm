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

async function abrirTroca() {
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
  return { form, n };
}

it("pede os dados fiscais da troca em Pagamento e reaproveita os do comprador", async () => {
  const { form, n } = await abrirTroca();
  expect(form.getByRole("heading", { name: "Dados para a NF-e de entrada" })).toBeVisible();
  expect(form.getByLabelText(/NCM do veículo/)).toHaveAttribute("aria-invalid", "true");
  expect(form.getByLabelText(/Data prevista de recebimento/)).toBeVisible();
  expect(form.getByLabelText(/^CPF/)).toHaveValue(n.cliente.documento);
  fireEvent.click(form.getByRole("checkbox", { name: "Usar dados do comprador" }));
  expect(form.getByLabelText(/^CPF/)).toHaveValue("");
  fireEvent.change(form.getByLabelText(/^CEP/), { target: { value: "01310-100" } });
  expect(await form.findByDisplayValue("3550308")).toBeVisible();
});

it("sugere veículos da FIPE na troca e permite cadastro manual", async () => {
  const { form } = await abrirTroca();
  const marca = form.getByLabelText(/^Marca/);
  const modelo = form.getByLabelText(/^Modelo/);
  const opcoes = (campo: HTMLElement) =>
    Array.from(
      document.getElementById(campo.getAttribute("list") ?? "")?.querySelectorAll("option") ?? [],
      (opcao) => opcao.value,
    );
  expect(opcoes(marca)).toContain("Renault");
  fireEvent.change(marca, { target: { value: "Renault" } });
  fireEvent.change(modelo, { target: { value: "Duster" } });
  const nomeFipe = "DUSTER Dynamique 2.0 Flex 16V Aut.";
  expect(opcoes(modelo)).toContain(nomeFipe);
  fireEvent.change(modelo, { target: { value: nomeFipe } });
  expect(modelo).toHaveValue("Duster");
  expect(form.getByLabelText("Versão")).toHaveValue("Dynamique 2.0 Flex 16V Aut.");
  expect(form.getByLabelText("Motor")).toHaveValue("2.0");
  expect(form.getByLabelText("Câmbio")).toHaveValue("Automático");
  expect(form.getByLabelText("Combustível")).toHaveValue("Flex");

  fireEvent.change(marca, { target: { value: "Fabricante independente" } });
  fireEvent.change(modelo, { target: { value: "Modelo fora do catálogo" } });
  expect(modelo).toHaveValue("Modelo fora do catálogo");
  expect(opcoes(modelo)).toHaveLength(0);
});
