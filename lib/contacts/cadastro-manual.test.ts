import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import type { ContactCreate } from "@/lib/schemas/contacts";
import type { Contact } from "@/lib/types/contacts";
import { hashCpf } from "./cpf";
import { atualizarCadastroManual } from "./cadastro-manual";
const ctx = {
  organization_id: "org-a",
  actor: { type: "user", id: "u" },
  requestId: "req",
} as HandlerCtx;
const entrada: ContactCreate = {
  reuse_existing_phone: true,
  source: "manual",
  name: "Ana Silva",
  phone_number: "+5531988887777",
};
function banco(rows: Record<string, unknown>[], erro = false) {
  const filtros: unknown[] = [];
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn((k, v) => {
      filtros.push([k, v]);
      return q;
    }),
    in: vi.fn((k, v) => {
      filtros.push([k, v]);
      return q;
    }),
    is: vi.fn((k, v) => {
      filtros.push([k, v]);
      return q;
    }),
    limit: vi.fn(async () => ({ data: rows, error: erro ? { message: "erro" } : null })),
  };
  const from = vi.fn(() => q);
  return { db: { from } as unknown as SupabaseClient, from, filtros };
}
const vivo = {
  id: "contato-original",
  cpf_hash: null,
  is_anonymized: false,
  contact_type: "cliente",
};
const atualizar = () =>
  vi.fn(
    async (_db: SupabaseClient, _ctx: HandlerCtx, id: string, patch: unknown) =>
      ({ id, ...(patch as object) }) as Contact,
  );
describe("cadastro manual completa a identidade do atendimento", () => {
  it("usa o mesmo ID e o patch auditado, sem recriar conversa ou apagar campos", async () => {
    const b = banco([vivo]),
      patch = atualizar();
    const r = await atualizarCadastroManual(
      b.db,
      ctx,
      { ...entrada, email: "ana@example.test", birthdate: "1990-01-01" },
      patch,
    );
    expect(r?.id).toBe(vivo.id);
    expect(patch).toHaveBeenCalledWith(b.db, ctx, vivo.id, {
      name: "Ana Silva",
      email: "ana@example.test",
      birthdate: "1990-01-01",
    });
    expect(b.filtros).toContainEqual(["organization_id", "org-a"]);
    expect(b.filtros).toContainEqual(["kind", "person"]);
    expect(b.filtros).toContainEqual(["is_merged_into", null]);
    expect(b.filtros).toContainEqual([
      "phone_number",
      expect.arrayContaining(["+5531988887777", "+553188887777"]),
    ]);
  });
  it("campos vazios não limpam o cadastro e telefone não é trocado por outra grafia", async () => {
    const b = banco([vivo]),
      patch = atualizar();
    await atualizarCadastroManual(
      b.db,
      ctx,
      { ...entrada, email: "", birthdate: undefined },
      patch,
    );
    expect(patch.mock.calls[0]?.[3]).toEqual({ name: "Ana Silva" });
  });
  it("CPF igual pode completar os demais dados", async () => {
    const b = banco([{ ...vivo, cpf_hash: hashCpf("52998224725") }]),
      patch = atualizar();
    await atualizarCadastroManual(b.db, ctx, { ...entrada, cpf: "529.982.247-25" }, patch);
    expect(patch).toHaveBeenCalledOnce();
  });
  it.each([
    [{ ...vivo, cpf_hash: hashCpf("11144477735") }],
    [{ ...vivo, is_anonymized: true }],
    [vivo, { ...vivo, id: "duplicado" }],
    [{ ...vivo, contact_type: "fornecedor" }],
  ])("não associa em conflito de identidade: %j", async (...rows) => {
    const b = banco(rows),
      patch = atualizar();
    await expect(
      atualizarCadastroManual(
        b.db,
        ctx,
        { ...entrada, cpf: "52998224725", contact_type: "cliente" },
        patch,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(patch).not.toHaveBeenCalled();
  });
  it("contato inexistente segue para criação normal", async () => {
    const b = banco([]);
    expect(await atualizarCadastroManual(b.db, ctx, entrada, atualizar())).toBeNull();
  });
  it.each([
    { ...entrada, reuse_existing_phone: false },
    { ...entrada, phone_number: undefined },
    { ...entrada, source: "whatsapp" },
  ])("não muda o contrato de outros cadastros: %o", async (input) => {
    const b = banco([]);
    expect(await atualizarCadastroManual(b.db, ctx, input, atualizar())).toBeNull();
    expect(b.from).not.toHaveBeenCalled();
  });
  it("agente de IA não ganha atualização implícita", async () => {
    const b = banco([]);
    expect(
      await atualizarCadastroManual(
        b.db,
        { ...ctx, actor: { type: "ai_agent", id: "a", agent_id: "a", role: "ai_operator" } },
        entrada,
        atualizar(),
      ),
    ).toBeNull();
    expect(b.from).not.toHaveBeenCalled();
  });
  it("falha de consulta não é ausência de cadastro", async () => {
    const b = banco([], true);
    await expect(atualizarCadastroManual(b.db, ctx, entrada, atualizar())).rejects.toMatchObject({
      status: 500,
    });
  });
  it("completa os dados do cliente sem apagar endereço anterior nem outros campos", async () => {
    const b = banco([
        {
          ...vivo,
          custom_fields: {
            segmento: "vip",
            cadastro_cliente: { cidade: "Cidade anterior", rg: "RG salvo" },
          },
        },
      ]),
      patch = atualizar();
    await atualizarCadastroManual(
      b.db,
      ctx,
      {
        ...entrada,
        custom_fields: { cadastro_cliente: { nacionalidade: "Brasileira", cnh: "CNH informada" } },
      },
      patch,
    );
    expect(patch.mock.calls[0]?.[3]).toMatchObject({
      custom_fields: {
        segmento: "vip",
        cadastro_cliente: {
          cidade: "Cidade anterior",
          rg: "RG salvo",
          nacionalidade: "Brasileira",
          cnh: "CNH informada",
        },
      },
    });
  });
});
