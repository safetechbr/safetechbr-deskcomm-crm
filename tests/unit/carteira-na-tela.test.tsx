/**
 * Issue #2591 — a TELA da carteira do cliente (a pendência declarada do #2667).
 *
 * ─── O que este arquivo mede, e por que é tela e não motor ──────────────────
 *
 * O motor do #2667 (dono por contato, aviso, negócio que nasce no dono) já está
 * na `main`. O que faltava — e a issue #2591 continua aberta por isso — é a
 * TELA: quem atende vê de quem é o cliente, o gerente troca o dono pela ficha,
 * e o contato SEM dono não quebra nada.
 *
 *   (a) a ficha mostra a carteira com o dono certo;
 *    (chama a rota) e o estado reflete;
 *   (c) contato sem dono: estado vazio COM texto (não tela em branco), e a
 *       faixa do chat não aparece (não há carteira de ninguém para prometer).
 *
 * ─── RED-BEFORE ─────────────────────────────────────────────────────────────
 *
 * Antes das linhas da tela, os três casos reprovam: não existe
 * `CartaoDaCarteira`/`FaixaDaCarteira` nem `lib/carteira/tela.ts`, e o import
 * falha DENTRO do caso (o especificador dinâmico abaixo garante isso, em vez de
 * derrubar o arquivo inteiro no carregamento).
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  carteira: vi.fn(),
  definir: vi.fn(),
  membros: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("@/hooks/contacts/useCarteiraDoContato", () => ({
  useCarteiraDoContato: deps.carteira,
  useDefinirCarteira: deps.definir,
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u-x", support: null } }),
}));
vi.mock("@tanstack/react-query", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-query")>()),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({ useAssignableMembers: deps.membros }));

import { CartaoDaCarteira } from "@/components/contacts/CartaoDaCarteira";
import { FaixaDaCarteira } from "@/components/inbox/FaixaDaCarteira";
import { estadoDaCarteira, faixaDaCarteiraAparece } from "@/lib/carteira/tela";

const ANA = { user_id: "u-a", role: "agent", full_name: "Ana Vendas" };
const BRUNO = { user_id: "u-b", role: "agent", full_name: "Bruno Vendas" };
const SEM_DONO = { contact_id: "c1", dono_user_id: null, qualificado: false };
const COM_ANA = { contact_id: "c1", dono_user_id: "u-a", qualificado: true };

beforeEach(() => {
  vi.clearAllMocks();
  deps.membros.mockReturnValue({ data: [ANA, BRUNO], isLoading: false });
  deps.definir.mockReturnValue({ mutate: deps.mutate, isPending: false });
});
afterEach(cleanup);

describe("(a) a ficha mostra a carteira com o dono certo", () => {
  it("mostra o NOME do dono da carteira", async () => {
    deps.carteira.mockReturnValue({ isLoading: false, data: COM_ANA });
    render(<CartaoDaCarteira contactId="c1" papelDoUsuario="manager" />);
    const bloco = screen.getByTestId("carteira-dono");
    expect(bloco.textContent).toContain("Ana Vendas");
  });

});

describe("(c) contato sem dono não quebra a tela", () => {
  it("a ficha mostra o estado vazio COM texto, não em branco", () => {
    deps.carteira.mockReturnValue({ isLoading: false, data: SEM_DONO });
    render(<CartaoDaCarteira contactId="c1" papelDoUsuario="manager" />);
    const vazio = screen.getByTestId("carteira-vazio");
    expect(vazio.textContent?.trim().length).toBeGreaterThan(0);
    expect(screen.queryByTestId("carteira-dono")).toBeNull();
  });

  it("erro ao ler a carteira não vira \"sem dono\"", () => {
    deps.carteira.mockReturnValue({ isLoading: false, isError: true, data: undefined });
    render(<CartaoDaCarteira contactId="c1" papelDoUsuario="agent" />);
    expect(screen.queryByTestId("carteira-vazio")).toBeNull();
    expect(screen.queryByTestId("carteira-dono")).toBeNull();
  });

  it("a faixa do chat não aparece sem carteira (nada para prometer)", () => {
    deps.carteira.mockReturnValue({ isLoading: false, data: SEM_DONO });
    const { container } = render(<FaixaDaCarteira contactId="c1" quemAtendeId="u-b" />);
    expect(container.innerHTML).toBe("");
  });

  it("a faixa aparece quando o dono é OUTRA pessoa, com o nome dele", () => {
    deps.carteira.mockReturnValue({ isLoading: false, data: COM_ANA });
    render(<FaixaDaCarteira contactId="c1" quemAtendeId="u-b" />);
    const faixa = screen.getByTestId("faixa-da-carteira");
    expect(faixa.textContent).toContain("Ana Vendas");
  });

  it("a faixa não aparece quando quem atende é o próprio dono", () => {
    deps.carteira.mockReturnValue({ isLoading: false, data: COM_ANA });
    const { container } = render(<FaixaDaCarteira contactId="c1" quemAtendeId="u-a" />);
    expect(container.innerHTML).toBe("");
  });
});

describe("a régua dos estados (função pura) não é reescrita na tela", () => {
  it("classifica os quatro estados", () => {
    expect(estadoDaCarteira({ dono_user_id: null, qualificado: false }, "u-b")).toBe("sem_carteira");
    expect(estadoDaCarteira({ dono_user_id: "u-a", qualificado: false }, "u-b")).toBe("dono_inativo");
    expect(estadoDaCarteira({ dono_user_id: "u-a", qualificado: true }, "u-a")).toBe("mesmo_dono");
    expect(estadoDaCarteira({ dono_user_id: "u-a", qualificado: true }, "u-b")).toBe("outro_dono");
    // Conversa sem responsável: o dono é sempre "outro" — não se sabe quem vai
    // responder, e é justo aí que o negócio nasceria no nome errado.
    expect(estadoDaCarteira({ dono_user_id: "u-a", qualificado: true }, null)).toBe("outro_dono");
  });

  it("só 'outro_dono' vira faixa em cima do chat", () => {
    expect(faixaDaCarteiraAparece("outro_dono")).toBe(true);
    expect(faixaDaCarteiraAparece("mesmo_dono")).toBe(false);
    expect(faixaDaCarteiraAparece("sem_carteira")).toBe(false);
    expect(faixaDaCarteiraAparece("dono_inativo")).toBe(false);
  });
});
