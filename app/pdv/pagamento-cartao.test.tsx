import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { lerTaxasDeCartao } from "@/lib/pdv/taxas-de-cartao";
import { PdvClient } from "./_client";

vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn().mockResolvedValue({ data: [] }) },
}));

afterEach(() => vi.unstubAllGlobals());

function abrirPdv({ telaLarga = true } = {}) {
  vi.stubGlobal("matchMedia", () => ({
    matches: telaLarga,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const taxasDeCartao = lerTaxasDeCartao({
    taxas_de_cartao: {
      padrao: null,
      perfis: [
        { id: "principal", nome: "Principal", bandeira: "Visa", debito: 100, credito: [300] },
        { id: "alternativo", nome: "Alternativo", bandeira: "Visa", debito: 150, credito: [500, 1000] },
      ],
    },
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PdvClient estoque={[]} urlsDasCapas={{}} negociacoesIniciais={[]} podeNegociar
        usuarioId="teste-perfil-cartao" titulo="PDV" taxasDeCartao={taxasDeCartao} />
    </QueryClientProvider>,
  );
}

it("seleciona o perfil pelo nome e aplica a taxa de cada parcela", async () => {
  abrirPdv();
  fireEvent.click(screen.getByTestId("pdv-forma-cartao_credito"));
  const cartao = within(screen.getByTestId("pdv-pagamento-0"));
  expect(cartao.queryByLabelText("1º vencimento")).not.toBeInTheDocument();
  const forma = cartao.getByRole("combobox", { name: "Forma de pagamento" });
  expect(within(forma).getAllByRole("option").map((opcao) => opcao.textContent)).toEqual([
    "Cartão de débito",
    "Cartão de crédito",
  ]);
  const perfil = cartao.getByRole("combobox", { name: "Perfil do cartão" });
  expect(perfil).toHaveValue("principal");
  expect(cartao.getByText("Taxa da máquina: 3%")).toBeInTheDocument();
  fireEvent.change(cartao.getByTestId("pdv-pagamento-0-valor"), { target: { value: "10000" } });
  fireEvent.change(perfil, { target: { value: "alternativo" } });
  expect(await cartao.findByText("Taxa da máquina: 5%")).toBeInTheDocument();

  const opcoesDeParcelas = within(cartao.getByRole("combobox", { name: "Parcelas" }));
  expect(opcoesDeParcelas.getByRole("option", { name: /1x R\$\s*105,26 \(5%\)/ })).toBeInTheDocument();
  expect(opcoesDeParcelas.getByRole("option", { name: /2x R\$\s*55,56 \(10%\)/ })).toBeInTheDocument();

  fireEvent.click(cartao.getByRole("button", { name: "Absorver" }));
  expect(opcoesDeParcelas.getByRole("option", { name: /2x R\$\s*50,00 \(10%\)/ })).toBeInTheDocument();
  fireEvent.click(cartao.getByRole("button", { name: "Repassar" }));

  fireEvent.change(cartao.getByRole("combobox", { name: "Parcelas" }), { target: { value: "2" } });
  expect(cartao.getByText("Taxa da máquina: 10%")).toBeInTheDocument();
  expect(cartao.getByText(/111,11/)).toBeInTheDocument();

  fireEvent.change(cartao.getByLabelText("Taxa deste cartão (%)"), { target: { value: "20" } });
  expect(opcoesDeParcelas.getByRole("option", { name: /2x R\$\s*62,50 \(20%\)/ })).toBeInTheDocument();
  expect(opcoesDeParcelas.getByRole("option", { name: /1x R\$\s*105,26 \(5%\)/ })).toBeInTheDocument();

  fireEvent.change(perfil, { target: { value: "" } });
  expect(cartao.getByText("Taxa da máquina a definir")).toBeInTheDocument();
  const parcelas = cartao.getByRole("spinbutton", { name: "Parcelas" });
  expect(parcelas).toHaveValue(2);
  fireEvent.change(cartao.getByLabelText("Taxa deste cartão (%)"), { target: { value: "7" } });
  fireEvent.change(parcelas, { target: { value: "3" } });
  expect(cartao.getByText("Taxa da máquina: 7%")).toBeInTheDocument();

  fireEvent.change(perfil, { target: { value: "principal" } });
  fireEvent.change(forma, { target: { value: "cartao_debito" } });
  expect(forma).toHaveValue("cartao_debito");
  expect(cartao.getByText("Taxa da máquina: 1%")).toBeInTheDocument();
  fireEvent.change(forma, { target: { value: "cartao_credito" } });
  expect(forma).toHaveValue("cartao_credito");
  expect(cartao.getByText("Taxa da máquina: 3%")).toBeInTheDocument();

  fireEvent.click(screen.getByText("Outras formas de pagamento"));
  fireEvent.click(screen.getByRole("button", { name: "+ Boleto" }));
  const boleto = within(screen.getByTestId("pdv-pagamento-1"));
  expect(boleto.getByLabelText("Forma de pagamento")).toHaveValue("boleto");
  const vencimento = boleto.getByLabelText("1º vencimento");
  fireEvent.change(vencimento, { target: { value: "2026-12-20" } });
  expect(vencimento).toHaveValue("2026-12-20");
});

it("mostra quanto falta após Pix e cartão e troca o rótulo quando sobra", async () => {
  abrirPdv();
  fireEvent.change(screen.getByTestId("pdv-valor"), { target: { value: "4590000" } });
  fireEvent.change(screen.getByRole("textbox", { name: "PIX", exact: true }), {
    target: { value: "1000000" },
  });
  const resumo = within(screen.getByTestId("pdv-resumo"));
  const saldo = resumo.getByTestId("pdv-troco");
  expect(resumo.getByText("Falta")).toBeInTheDocument();
  expect(saldo).toHaveTextContent(/35\.900,00/);

  fireEvent.click(screen.getByTestId("pdv-forma-cartao_credito"));
  const cartao = within(screen.getByTestId("pdv-pagamento-1"));
  fireEvent.change(cartao.getByRole("combobox", { name: "Perfil do cartão" }), {
    target: { value: "alternativo" },
  });
  fireEvent.change(cartao.getByTestId("pdv-pagamento-1-valor"), { target: { value: "2000000" } });
  expect(await resumo.findByText(/15\.900,00/)).toBe(saldo);

  fireEvent.click(cartao.getByRole("button", { name: "Absorver" }));
  expect(resumo.getByTestId("pdv-pago")).toHaveTextContent(/29\.000,00/);
  expect(saldo).toHaveTextContent(/16\.900,00/);

  const dinheiro = screen.getByRole("textbox", { name: "Dinheiro", exact: true });
  fireEvent.change(dinheiro, { target: { value: "1690000" } });
  expect(resumo.getByText("Falta")).toBeInTheDocument();
  expect(saldo).toHaveTextContent(/R\$\s*0,00/);
  fireEvent.change(dinheiro, { target: { value: "1700000" } });
  expect(resumo.getByText("Troco")).toBeInTheDocument();
  expect(saldo).toHaveTextContent(/100,00/);
});

it("mantém pagamento por último ao separar o contrato e permite voltar com o rascunho", async () => {
  abrirPdv();
  const alternarLayout = screen.getByRole("button", { name: "4 colunas" });
  const secaoDoPagamento = screen.getByTestId("pdv-resumo").closest("section[id]");
  expect(secaoDoPagamento).toContainElement(screen.getByTestId("pdv-dados-contrato"));
  fireEvent.change(screen.getByTestId("pdv-observacoes"), { target: { value: "Combinar entrega." } });

  fireEvent.click(alternarLayout);
  expect(alternarLayout).toHaveAttribute("aria-pressed", "true");
  const colunaDoContrato = screen.getByRole("heading", { name: "Dados do contrato", level: 2 }).closest("section");
  expect(colunaDoContrato).toContainElement(screen.getByTestId("pdv-dados-contrato"));
  expect(colunaDoContrato).toContainElement(screen.getByTestId("pdv-observacoes"));
  expect(secaoDoPagamento).not.toContainElement(screen.getByTestId("pdv-dados-contrato"));
  expect(colunaDoContrato?.parentElement?.nextElementSibling).toContainElement(secaoDoPagamento);
  expect(screen.getByRole("heading", { name: "Pagamento", exact: true })).not.toHaveClass("uppercase");

  fireEvent.click(alternarLayout);
  expect(alternarLayout).toHaveAttribute("aria-pressed", "false");
  expect(secaoDoPagamento).toContainElement(screen.getByTestId("pdv-dados-contrato"));
  expect(screen.getByTestId("pdv-observacoes")).toHaveValue("Combinar entrega.");
  await screen.findAllByText("Cadastre uma conta financeira para receber.");
});

it("no celular, coloca o contrato na terceira etapa e o pagamento na última", async () => {
  abrirPdv({ telaLarga: false });
  const navegacao = within(screen.getByTestId("pdv-bolinhas"));
  expect(navegacao.getAllByRole("button").map((botao) => botao.getAttribute("aria-label"))).toEqual([
    "Cliente",
    "Veículos",
    "Dados do contrato",
    "Pagamento",
  ]);

  const pagamento = navegacao.getByRole("button", { name: "Pagamento" });
  const contrato = navegacao.getByRole("button", { name: "Dados do contrato" });
  const painelDoPagamento = screen.getByRole("heading", { name: "Pagamento", exact: true }).closest("section");
  const painelDoContrato = screen.getByRole("heading", { name: "Dados do contrato", level: 2 }).closest("section");
  expect(painelDoPagamento).not.toContainElement(screen.getByTestId("pdv-dados-contrato"));

  fireEvent.click(contrato);
  expect(contrato).toHaveAttribute("aria-current", "true");
  expect(painelDoContrato?.parentElement).not.toHaveClass("hidden");
  expect(painelDoPagamento?.parentElement).toHaveClass("hidden");

  fireEvent.click(pagamento);
  expect(pagamento).toHaveAttribute("aria-current", "true");
  expect(painelDoPagamento?.parentElement).not.toHaveClass("hidden");
  expect(painelDoContrato?.parentElement).toHaveClass("hidden");
  await screen.findAllByText("Cadastre uma conta financeira para receber.");
});
