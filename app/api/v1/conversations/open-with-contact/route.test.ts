import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAuthDual, tetoDeEscritaDoToken } from "@/lib/api/auth-dual";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { openSharedContactConversation } from "@/lib/messaging/open-shared-contact-conversation";
import { audit } from "@/lib/audit";
import { registrarTrocaDeComando } from "@/lib/inbox/atividade-de-comando";
import { sincronizarNegocioAbertoDoContato } from "@/lib/inbox/negocio-aberto-do-contato";

import { POST } from "./route";

/**
 * POST /api/v1/conversations/open-with-contact — a conversa que "Iniciar
 * conversa" abre nasce de QUEM CLICOU (#3479).
 *
 * ═══ O que esta rota deixava passar ═══
 *
 * Ela garante a conversa (cria pelo `fn_service_begin`, que INSERTA com
 * `assigned_to_user_id` nulo, ou reabre a fechada) e devolvia o id. O diálogo do
 * Inbox pedia o `claim` logo depois; a tabela de Contatos, o quadro do funil e o
 * cartão de contato NÃO pediam. Com `visibility_mode = 'own'` a conversa sem dono
 * é invisível a Atendente nenhum, então essas telas abriam um Inbox vazio — e o
 * diálogo do Inbox traduzia o mesmo estado em "está com outro atendente", sobre
 * uma conversa sem dono.
 *
 * ═══ O que se mede aqui, e o que NÃO se mede ═══
 *
 * Dublê, não banco: o que a rota DECIDE (pedir o claim, para quem, em que modo de
 * identidade) é o que este arquivo vigia. Que o banco então deixe a assinatura
 * acontecer é invariante de Postgres de verdade:
 * `tests/invariants/assumir-conversa-livre-no-modo-own.test.ts`. Os dois lados
 * são necessários — a rota certa sobre um RPC que recusa continua quebrada, e o
 * RPC certo que a rota não chama também.
 */

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const USER = "aaaaaaaa-3333-4000-8000-000000000003";
const CONV = "aaaaaaaa-1111-4000-8000-000000000001";
const CONTATO = "aaaaaaaa-5555-4000-8000-000000000009";
const CONVERSA_DA_ORG = { id: CONV, organization_id: ORG_A, contact_id: CONTATO };

// O claim passa pelo portão transacional do atendimento protegido
// (`alterarAtendimento`, com prova de integração própria): aqui o dublê só
// responde o que o banco responderia e registra o que a rota pediu.
const portao = vi.hoisted(() => ({
  chamadas: [] as Array<Record<string, unknown>>,
  linha: null as Record<string, unknown> | null,
  falha: null as string | null,
}));
vi.mock("@/lib/atendimento/servidor", () => ({
  alterarAtendimento: vi.fn(async (p: Record<string, unknown>) => {
    portao.chamadas.push(p);
    if (portao.falha) throw new Error(portao.falha);
    return { conversation: portao.linha, dono_user_id: null, antes: null, autorizado_por_senha: false };
  }),
}));

type Rpc = { nome: string; params: Record<string, unknown> };

/** O dublê do cliente: registra os RPC e responde o que o caso pedir. */
function clienteFake(resposta: { data: unknown; error: { message: string } | null }): {
  cliente: SupabaseClient;
  rpcs: Rpc[];
} {
  const rpcs: Rpc[] = [];
  portao.chamadas.length = 0;
  portao.falha = resposta.error?.message ?? null;
  portao.linha = Array.isArray(resposta.data) ? ((resposta.data[0] as Record<string, unknown>) ?? null) : null;
  const cliente = {
    rpc: async (nome: string, params: Record<string, unknown>) => {
      rpcs.push({ nome, params });
      if (nome === "emit_event") return { data: null, error: null };
      return resposta;
    },
  } as unknown as SupabaseClient;
  return { cliente, rpcs };
}

function authzDeSessao(cliente: SupabaseClient) {
  return {
    ok: true as const,
    organizationId: ORG_A,
    actor: { type: "user" as const, id: USER, role: "agent" as const },
    supabase: cliente,
    idioma: "pt-BR" as const,
    via: "session" as const,
  };
}

function authzDeToken(cliente: SupabaseClient) {
  return {
    ...authzDeSessao(cliente),
    actor: { type: "api_token" as const, id: "aaaaaaaa-7777-4000-8000-000000000001", role: "agent" as const },
    via: "token" as const,
    scopes: ["mcp:write"],
  };
}

function requisicao(): NextRequest {
  return new NextRequest("http://localhost/api/v1/conversations/open-with-contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contact_id: CONTATO }),
  });
}

const mResolve = vi.mocked(resolveAuthDual);
const mTeto = vi.mocked(tetoDeEscritaDoToken);
const mSuporte = vi.mocked(requireSupportWrite);
const mAbrir = vi.mocked(openSharedContactConversation);

beforeEach(() => {
  vi.clearAllMocks();
  mSuporte.mockResolvedValue(null);
  mTeto.mockResolvedValue(null);
  mAbrir.mockResolvedValue({ conversation_id: CONV, contact_id: CONTATO });
});

vi.mock("@/lib/api/auth-dual", () => ({
  resolveAuthDual: vi.fn(),
  tetoDeEscritaDoToken: vi.fn(),
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/inbox/atividade-de-comando", () => ({ registrarTrocaDeComando: vi.fn(async () => undefined) }));
vi.mock("@/lib/inbox/negocio-aberto-do-contato", () => ({
  sincronizarNegocioAbertoDoContato: vi.fn(async () => ({ gravou: false, motivo: "sem_negocio_aberto", abertos: 0 })),
}));
vi.mock("@/lib/messaging/open-shared-contact-conversation", () => ({
  openSharedContactConversation: vi.fn(),
}));

describe("#3479 — abrir a conversa assume a conversa SEM dono", () => {
  it("⭐ a sessão do navegador pede o claim da conversa que acabou de abrir", async () => {
    const { cliente, rpcs } = clienteFake({ data: [CONVERSA_DA_ORG], error: null });
    mResolve.mockResolvedValue(authzDeSessao(cliente));

    const res = await POST(requisicao());
    expect(res.status).toBe(200);

    expect(portao.chamadas).toHaveLength(1);
    expect(portao.chamadas[0]).toMatchObject({
      orgId: ORG_A,
      conversationId: CONV,
      actorId: USER,
      acao: "assumir",
    });
    // `expected` NÃO vai: é o contrato de "assuma se estiver livre", e a senha
    // administrativa também não — abrir uma conversa nunca toma a de outro.
    expect(portao.chamadas[0]?.expected).toBeUndefined();
    expect(portao.chamadas[0]?.senha).toBeUndefined();
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0]?.nome).toBe("emit_event");
    expect(audit).toHaveBeenCalledOnce();
    expect(registrarTrocaDeComando).toHaveBeenCalledOnce();
    expect(sincronizarNegocioAbertoDoContato).toHaveBeenCalledOnce();
  });

  it("o cliente é o da SESSÃO, nunca o admin que abriu a conversa", async () => {
    // Quem assume é quem clicou: o `changed_by` de
    // `conversation_assignment_events` é `auth.uid()`, e pelo admin ele seria
    // nulo — o registro perderia o autor exatamente no caminho do #3479.
    const { cliente, rpcs } = clienteFake({ data: [CONVERSA_DA_ORG], error: null });
    mResolve.mockResolvedValue(authzDeSessao(cliente));

    await POST(requisicao());
    expect(portao.chamadas[0]?.actorId).toBe(USER);
    expect(rpcs).toHaveLength(1);
    expect(mAbrir).toHaveBeenCalledOnce();
  });

  it("token de servidor NÃO assume em nome de ninguém", async () => {
    const { cliente, rpcs } = clienteFake({ data: [CONVERSA_DA_ORG], error: null });
    mResolve.mockResolvedValue(authzDeToken(cliente));

    const res = await POST(requisicao());
    expect(res.status).toBe(200);
    expect(portao.chamadas).toHaveLength(0);
    expect(rpcs).toHaveLength(0);
  });

  it("conversa que já tinha dono (zero linhas) não vira erro nem muda a resposta", async () => {
    const { cliente, rpcs } = clienteFake({ data: [], error: null });
    mResolve.mockResolvedValue(authzDeSessao(cliente));

    const res = await POST(requisicao());
    expect(res.status).toBe(200);
    expect(portao.chamadas).toHaveLength(1);
    expect(rpcs).toHaveLength(0);
    await expect(res.json()).resolves.toMatchObject({
      data: { conversation_id: CONV, contact_id: CONTATO },
    });
  });

  it("falha do claim não derruba a abertura (a conversa já existe)", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const { cliente } = clienteFake({ data: null, error: { message: "boom" } });
    mResolve.mockResolvedValue(authzDeSessao(cliente));

    const res = await POST(requisicao());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ data: { conversation_id: CONV } });
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});
