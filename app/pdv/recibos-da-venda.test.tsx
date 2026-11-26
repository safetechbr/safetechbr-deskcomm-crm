import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api/client";
import { RecibosDaVenda } from "./_client";

vi.mock("@/app/actions/pdv/salvarPadraoDaLoja", () => ({ salvarPadraoDaLoja: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn() } }));

const ID = "e0a302ab-c0a2-41a7-82ca-b0e68c50e7e9";
const BASE = `/api/v1/pdv/negociacoes/${ID}`;
const get = vi.mocked(apiClient.get);

afterEach(() => get.mockReset());

function responde(data: unknown) {
  get.mockResolvedValue({ data } as never);
}

it("lista o recibo de cada recebimento e o que falta receber, sem quitação", async () => {
  responde({ recibos: [{ numero: 1, valor_cents: 3000000, saldo_cents: 7000000 }], quitada: false, pendente_cents: 7000000 });
  render(<RecibosDaVenda negociacaoId={ID} botao="" />);
  const link = await screen.findByRole("link", { name: /Nº 1/ });
  expect(link).toHaveAttribute("href", `${BASE}/recibos/1`);
  expect(screen.getByText(/A receber/).textContent).toContain("70.000,00");
  expect(screen.queryByTestId("pdv-quitacao")).toBeNull();
  expect(get).toHaveBeenCalledWith(`${BASE}/recibos`);
});

it("com o saldo zerado oferece o termo de quitação", async () => {
  responde({
    recibos: [
      { numero: 1, valor_cents: 3000000, saldo_cents: 7000000 },
      { numero: 2, valor_cents: 7000000, saldo_cents: 0 },
    ],
    quitada: true,
    pendente_cents: 0,
  });
  render(<RecibosDaVenda negociacaoId={ID} botao="" />);
  expect(await screen.findByTestId("pdv-quitacao")).toHaveAttribute("href", `${BASE}/quitacao`);
  expect(screen.getAllByRole("link", { name: /Nº \d/ })).toHaveLength(2);
  expect(screen.queryByText(/A receber/)).toBeNull();
});

it("sem recibo nem quitação não mostra nada", async () => {
  responde({ recibos: [], quitada: false, pendente_cents: 10000000 });
  const { container } = render(<RecibosDaVenda negociacaoId={ID} botao="" />);
  await waitFor(() => expect(get).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});
