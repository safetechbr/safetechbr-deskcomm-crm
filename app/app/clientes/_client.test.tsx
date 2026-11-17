// @vitest-environment jsdom
import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Contact } from "@/lib/types/contacts";
import type { Negociacao } from "@/lib/pdv/regras";

const contato = (id: string, name: string, source: string): Contact =>
  ({
    id,
    name,
    source,
    contact_type: "cliente",
    phone_number: null,
    email: null,
    created_at: "2026-01-01T00:00:00Z",
  }) as unknown as Contact;

vi.mock("@/hooks/contacts/useContactList", () => ({
  useContactList: () => ({
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    data: {
      pages: [
        {
          data: [
            contato("a", "Lead que comprou", "whatsapp"),
            contato("b", "Lead que só conversou", "whatsapp"),
            contato("c", "Cadastrado no PDV", "manual"),
          ],
        },
      ],
    },
  }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

const apagar = vi.fn();
vi.mock("@/hooks/contacts/useDeleteContact", () => ({
  useDeleteContact: () => ({ mutate: apagar }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));
vi.mock("@/app/pdv/cadastro-cliente-modal", () => ({
  CadastroClienteModal: () => null,
}));

import { ClientesClient } from "./_client";

describe("Clientes", () => {
  it("lista lead de canal que comprou e quem é manual, sem quem só conversou", () => {
    render(
      <ClientesClient negociacoes={[{ id: "n1", contact_id: "a" } as unknown as Negociacao]} />,
    );
    expect(screen.getByTestId("cliente-a")).toBeTruthy();
    expect(screen.getByTestId("cliente-c")).toBeTruthy();
    expect(screen.queryByTestId("cliente-b")).toBeNull();
  });

  it("cada cliente tem ver, editar e excluir; excluir pede confirmação", () => {
    render(<ClientesClient negociacoes={[]} />);
    expect(screen.getByTestId("ver-c")).toBeTruthy();
    expect(screen.getByTestId("editar-c")).toBeTruthy();
    fireEvent.click(screen.getByTestId("excluir-c"));
    expect(apagar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(apagar).toHaveBeenCalledWith("c");
  });

  it("ver abre a ficha do cliente", () => {
    render(<ClientesClient negociacoes={[]} />);
    fireEvent.click(screen.getByTestId("ver-c"));
    expect(screen.getByTestId("ficha-do-cliente")).toBeTruthy();
  });
});
