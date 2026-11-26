/**
 * Isolamento das tabelas do RENAVE (migration 9058) entre duas organizações, e
 * sigilo da chave de API: `authenticated` lê a própria linha de
 * `renave_integracoes`, mas nunca as colunas cifradas da chave.
 */
import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode esta suíte via `pnpm test:db` (scripts/test-db.sh)");
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-"],
    { input: script, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

function comoUsuario(userId: string, consulta: string): string {
  return sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    ${consulta}
  `);
}

function contar(userId: string, consulta: string): number {
  const linhas = comoUsuario(userId, consulta).split("\n");
  const ultima = linhas[linhas.length - 1];
  if (ultima === undefined || !/^\d+$/.test(ultima)) throw new Error(`saída inesperada do psql: ${linhas.join("\n")}`);
  return Number(ultima);
}

const ORG_A = "9058a000-0000-4000-8000-00000000000a";
const ORG_B = "9058b000-0000-4000-8000-00000000000b";
const USER_A = "9058a000-0000-4000-8000-0000000000a1";
const USER_B = "9058b000-0000-4000-8000-0000000000b1";
const VEIC_A = "9058a000-0000-4000-8000-0000000000c1";
const VEIC_B = "9058b000-0000-4000-8000-0000000000c2";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'renave-a@teste.local'), ('${USER_B}', 'renave-b@teste.local') on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'renave-iso-a', 'Renave A Ltda', 'Renave A'),
      ('${ORG_B}', 'renave-iso-b', 'Renave B Ltda', 'Renave B') on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_A}', '${ORG_A}', 'admin', now()), ('${USER_B}', '${ORG_B}', 'admin', now()) on conflict do nothing;
    insert into public.veiculos (id, organization_id, codigo, modelo) values
      ('${VEIC_A}', '${ORG_A}', 'RNV-ISO-A', 'Modelo A'),
      ('${VEIC_B}', '${ORG_B}', 'RNV-ISO-B', 'Modelo B') on conflict do nothing;
    insert into public.renave_integracoes (organization_id, api_key_ciphertext, api_key_iv, api_key_tag, api_key_last4, cnpj) values
      ('${ORG_A}', '\\x00'::bytea, '\\x00'::bytea, '\\x00'::bytea, '1111', '12345678000190'),
      ('${ORG_B}', '\\x00'::bytea, '\\x00'::bytea, '\\x00'::bytea, '2222', '12345678000190') on conflict do nothing;
    insert into public.renave_veiculos (organization_id, veiculo_id) values
      ('${ORG_A}', '${VEIC_A}'), ('${ORG_B}', '${VEIC_B}') on conflict do nothing;
    insert into public.renave_envios (organization_id, operacao, endpoint, metodo) values
      ('${ORG_A}', 'compra', '/teste', 'POST'), ('${ORG_B}', 'compra', '/teste', 'POST');
  `);
});

const TABELAS = ["renave_integracoes", "renave_integracoes_safe", "renave_veiculos", "renave_envios"];

describe("RENAVE — isolamento entre organizações", () => {
  for (const t of TABELAS) {
    it(`${t}: membro vê a própria org e não vê a vizinha`, () => {
      // controle positivo: sem ele, um zero do outro lado provaria só que a tabela está vazia
      expect(contar(USER_A, `select count(*) from public.${t} where organization_id = '${ORG_A}';`)).toBeGreaterThan(0);
      expect(contar(USER_A, `select count(*) from public.${t} where organization_id = '${ORG_B}';`)).toBe(0);
      expect(contar(USER_B, `select count(*) from public.${t} where organization_id = '${ORG_A}';`)).toBe(0);
    });
  }

  it("authenticated não lê a chave cifrada, nem da própria org", () => {
    expect(() => comoUsuario(USER_A, `select api_key_ciphertext from public.renave_integracoes;`)).toThrow(/permission denied/);
    expect(contar(USER_A, `select count(api_key_last4) from public.renave_integracoes;`)).toBe(1);
  });
});
