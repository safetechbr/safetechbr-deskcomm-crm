import { beforeAll, describe, expect, it } from "vitest";
import { countAs, sql, writeCountAs } from "./gov-helpers";

const A = "edc00101-0000-4000-8000-000000000001";
const B = "edc00101-0000-4000-8000-000000000002";
const USER = "edc00101-0000-4000-8000-000000000003";

beforeAll(() => {
  sql(`
    insert into auth.users(id,email) values ('${USER}','estoque-agent@invariant.test') on conflict do nothing;
    insert into organizations(id,slug,legal_name,display_name) values
      ('${A}','estoque-agent-a','Estoque A','Estoque A'),
      ('${B}','estoque-agent-b','Estoque B','Estoque B') on conflict do nothing;
    insert into user_organizations(user_id,organization_id,role,accepted_at)
      values ('${USER}','${A}','agent',now()) on conflict do nothing;
    insert into veiculos(organization_id,codigo,modelo,preco_cents,status) values
      ('${A}','EA-1','Modelo disponível A',4900000,'disponivel'),
      ('${A}','EA-2','Modelo reservado A',5100000,'reservado'),
      ('${B}','EB-1','Modelo privado B',100000,'disponivel') on conflict do nothing;
  `);
});

describe("estoque consultado pelo agente — isolamento real", () => {
  it("o atendente vê só disponíveis da própria empresa", () => {
    expect(countAs(USER, `select count(*) from veiculos where organization_id='${A}' and status='disponivel';`)).toBe(1);
  });
  it("sem filtro cosmético a RLS continua barrando a outra empresa", () => {
    expect(countAs(USER, `select count(*) from veiculos where organization_id in ('${A}','${B}') and status='disponivel';`)).toBe(1);
    expect(countAs(USER, `select count(*) from veiculos where organization_id='${B}';`)).toBe(0);
  });
  it("o controle prova que o veículo de outra empresa existe", () => {
    expect(sql(`select count(*) from veiculos where organization_id='${B}';`)).toBe("1");
  });
  it("o papel de atendente não ganha permissão para mudar preço", () => {
    expect(writeCountAs(USER, `update veiculos set preco_cents=1 where organization_id='${A}' and codigo='EA-1'`)).toBe(0);
    expect(sql(`select preco_cents from veiculos where organization_id='${A}' and codigo='EA-1';`)).toBe("4900000");
  });
});
