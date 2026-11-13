import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CadastroClienteModal } from "./cadastro-cliente-modal";
import { apiClient } from "@/lib/api/client";
import { salvarArquivoDoCliente } from "@/components/pdv/documentos-do-cliente";
import { lerDocumentoCliente } from "@/lib/pdv/ler-documento-cliente";
import type * as Leitor from "@/lib/pdv/ler-documento-cliente";
vi.mock("@/lib/pdv/ler-documento-cliente", async (original) => ({
  ...(await original<typeof Leitor>()),
  lerDocumentoCliente: vi.fn(),
}));
vi.mock("@/components/pdv/documentos-do-cliente", () => ({
  DocumentosDoCliente: () => null,
  salvarArquivoDoCliente: vi.fn().mockResolvedValue({
    id: "fb000000-0000-4000-8000-000000000001",
    kind: "identidade",
    file_name: "teste.png",
  }),
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { post: vi.fn(), get: vi.fn(), patch: vi.fn() } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

function abrir(props: Partial<React.ComponentProps<typeof CadastroClienteModal>> = {}) {
  const onSalvo = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CadastroClienteModal
        open
        onOpenChange={vi.fn()}
        retornoDoFoco={{ current: null }}
        onSalvo={onSalvo}
        {...props}
      />
    </QueryClientProvider>,
  );
  return onSalvo;
}
describe("um cadastro de cliente no PDV", () => {
  beforeEach(() => vi.clearAllMocks());
  it("cadastro pessoal e endereço alimentam o contato e o contrato no mesmo salvamento", async () => {
    vi.mocked(apiClient.post).mockImplementation(async (_url, body) => {
      const b = body as { name: string; custom_fields: Record<string, unknown> };
      return { data: { contact: { id: "c", name: b.name, custom_fields: b.custom_fields } } };
    });
    const salvo = abrir();
    fireEvent.change(screen.getByTestId("pdv-novo-cliente-nome"), {
      target: { value: "Cliente Exemplo" },
    });
    fireEvent.change(screen.getByLabelText("Nacionalidade"), { target: { value: "Brasileira" } });
    fireEvent.click(screen.getByRole("tab", { name: "Endereço" }));
    fireEvent.change(screen.getByLabelText("Rua"), { target: { value: "Rua Exemplo" } });
    fireEvent.click(screen.getByTestId("pdv-novo-cliente-salvar"));
    await waitFor(() =>
      expect(salvo).toHaveBeenCalledWith(
        expect.objectContaining({
          nome: "Cliente Exemplo",
          nacionalidade: "Brasileira",
          endereco: "Rua Exemplo",
        }),
        "c",
      ),
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      "/api/v1/contacts",
      expect.objectContaining({
        custom_fields: {
          cadastro_cliente: { nacionalidade: "Brasileira", endereco: "Rua Exemplo" },
        },
      }),
    );
  });
  it("editar usa o mesmo contato e preserva campos do CRM", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        id: "c-existente",
        name: "Loja",
        custom_fields: { segmento: "vip", cadastro_cliente: { cidade: "Cidade salva" } },
      },
    });
    vi.mocked(apiClient.patch).mockImplementation(async (_url, body) => ({
      data: { id: "c-existente", ...(body as object) },
    }));
    const salvo = abrir({
      contactId: "c-existente",
      inicial: {
        nome: "Loja",
        documento: "11.222.333/0001-81",
        cidade: "Cidade salva",
        nacionalidade: "Brasileira",
      },
    });
    expect(screen.getByText("Editar cadastro do cliente")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("RG"), { target: { value: "RG informado" } });
    fireEvent.click(screen.getByTestId("pdv-novo-cliente-salvar"));
    await waitFor(() =>
      expect(salvo).toHaveBeenCalledWith(
        expect.objectContaining({
          nome: "Loja",
          documento: "11.222.333/0001-81",
          rg: "RG informado",
          cidade: "Cidade salva",
        }),
        "c-existente",
      ),
    );
    expect(apiClient.patch).toHaveBeenCalledWith(
      "/api/v1/contacts/c-existente",
      expect.objectContaining({
        custom_fields: expect.objectContaining({
          segmento: "vip",
          cadastro_cliente: expect.objectContaining({ cnpj: "11222333000181", rg: "RG informado" }),
        }),
      }),
    );
  });
  it("preenche pelo documento, preserva digitação durante a leitura e salva no cadastro canônico", async () => {
    let concluir!: (r: Awaited<ReturnType<typeof lerDocumentoCliente>>) => void;
    vi.mocked(lerDocumentoCliente).mockImplementation(
      () =>
        new Promise((r) => {
          concluir = r;
        }),
    );
    vi.mocked(apiClient.post).mockImplementation(async (_url, body) => {
      const b = body as { name: string; birthdate: string; custom_fields: Record<string, unknown> };
      return {
        data: {
          contact: {
            id: "documento",
            name: b.name,
            birthdate: b.birthdate,
            custom_fields: b.custom_fields,
          },
        },
      };
    });
    const salvo = abrir();
    fireEvent.change(screen.getByLabelText("Documento do cliente"), {
      target: { files: [new File(["foto"], "cnh.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(lerDocumentoCliente).toHaveBeenCalled());
    expect(screen.getByTestId("pdv-novo-cliente-salvar")).toBeDisabled();
    fireEvent.change(screen.getByTestId("pdv-novo-cliente-nome"), {
      target: { value: "Nome conferido" },
    });
    concluir({
      dados: {
        nome: "NOME OCR",
        documento: "529.982.247-25",
        rg: "12345678-X",
        cnh: "12345678901",
        nascimento: "1990-05-01",
      },
      avisos: [],
    });
    await waitFor(() => expect(screen.getByLabelText("CNH")).toHaveValue("12345678901"));
    expect(screen.getByTestId("pdv-novo-cliente-nome")).toHaveValue("Nome conferido");
    expect(screen.getByLabelText("Nascimento")).toHaveValue("1990-05-01");
    fireEvent.click(screen.getByTestId("pdv-novo-cliente-salvar"));
    await waitFor(() =>
      expect(salvo).toHaveBeenCalledWith(
        expect.objectContaining({
          nome: "Nome conferido",
          rg: "12345678-X",
          cnh: "12345678901",
          nascimento: "1990-05-01",
          documento: "529.982.247-25",
        }),
        "documento",
      ),
    );
    expect(apiClient.post).toHaveBeenLastCalledWith(
      "/api/v1/contacts",
      expect.objectContaining({
        cpf: "52998224725",
        custom_fields: { cadastro_cliente: { rg: "12345678-X", cnh: "12345678901", cnpj: null } },
      }),
    );
  });
  it("cancelar a leitura descarta um resultado atrasado e libera o cadastro manual", async () => {
    let concluir!: (r: Awaited<ReturnType<typeof lerDocumentoCliente>>) => void;
    let sinal!: AbortSignal;
    vi.mocked(lerDocumentoCliente).mockImplementation((_f, s) => {
      sinal = s;
      return new Promise((r) => {
        concluir = r;
      });
    });
    abrir();
    fireEvent.change(screen.getByLabelText("Documento do cliente"), {
      target: { files: [new File(["foto"], "rg.png")] },
    });
    await waitFor(() => expect(sinal).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar leitura" }));
    expect(sinal.aborted).toBe(true);
    concluir({ dados: { nome: "NAO PREENCHER" }, avisos: [] });
    await waitFor(() => expect(screen.getByTestId("pdv-novo-cliente-salvar")).toBeEnabled());
    expect(screen.getByTestId("pdv-novo-cliente-nome")).toHaveValue("");
  });
  it("erro de leitura mantém entrada manual disponível e não salva automaticamente", async () => {
    vi.mocked(lerDocumentoCliente).mockRejectedValueOnce(
      new Error("Não foi possível ler o documento."),
    );
    abrir();
    fireEvent.change(screen.getByLabelText("Documento do cliente"), {
      target: { files: [new File(["ilegivel"], "rg.png")] },
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível ler"),
    );
    expect(screen.getByTestId("pdv-novo-cliente-salvar")).toBeEnabled();
    expect(screen.getByTestId("pdv-novo-cliente-nome")).toHaveValue("");
    expect(apiClient.post).not.toHaveBeenCalled();
  });
  it("falha de upload mantém o anexo para repetir sem criar outro cliente", async () => {
    vi.mocked(lerDocumentoCliente).mockResolvedValue({
      dados: { nome: "Cliente do documento" },
      avisos: [],
    });
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        contact: { id: "fb000000-0000-4000-8000-000000000040", name: "Cliente do documento" },
      },
    });
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        id: "fb000000-0000-4000-8000-000000000040",
        name: "Cliente do documento",
        custom_fields: {},
      },
    });
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { id: "fb000000-0000-4000-8000-000000000040", name: "Cliente do documento" },
    });
    vi.mocked(salvarArquivoDoCliente).mockRejectedValueOnce(new Error("Falha no armazenamento"));
    const salvo = abrir();
    fireEvent.change(screen.getByLabelText("Documento do cliente"), {
      target: { files: [new File(["foto"], "identidade.png")] },
    });
    await waitFor(() =>
      expect(screen.getByTestId("pdv-novo-cliente-nome")).toHaveValue("Cliente do documento"),
    );
    await waitFor(() => expect(screen.getByTestId("pdv-novo-cliente-salvar")).toBeEnabled());
    fireEvent.click(screen.getByTestId("pdv-novo-cliente-salvar"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Falha no armazenamento"),
    );
    expect(salvo).not.toHaveBeenCalled();
    expect(screen.getByText("identidade.png")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pdv-novo-cliente-salvar"));
    await waitFor(() =>
      expect(salvo).toHaveBeenCalledWith(
        expect.objectContaining({ documentos: ["fb000000-0000-4000-8000-000000000001"] }),
        "fb000000-0000-4000-8000-000000000040",
      ),
    );
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.patch).toHaveBeenCalledTimes(1);
  });
  it("leitura sem dados remove o progresso de 100% e mostra somente o erro", async () => {
    vi.mocked(lerDocumentoCliente).mockImplementation(async (_f, _s, progresso) => {
      progresso("Lendo documento… 100%");
      return { dados: {}, avisos: [] };
    });
    abrir();
    fireEvent.change(screen.getByLabelText("Documento do cliente"), {
      target: { files: [new File(["foto"], "cnh.png")] },
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Dados não identificados"),
    );
    expect(screen.queryByText("Lendo documento… 100%")).not.toBeInTheDocument();
    expect(screen.getByTestId("pdv-novo-cliente-salvar")).toBeEnabled();
  });
});
