import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sql } from "./psql-transporte";

const ORG = "f2ef76cd-f6e9-45dd-a8b1-2d53cbfb5c71";
const OUTRA = "174dd541-ff1a-47cc-80ae-f33c0a7b774e";
const CNPJ = '{"cadastro_cliente":{"cnpj":"11222333000181"}}';
const CNPJ_COM_MASCARA = '{"cadastro_cliente":{"cnpj":"11.222.333/0001-81"}}';

const preparar = `
  begin;
  insert into public.organizations (id, slug, legal_name, display_name) values
    ('${ORG}', 'cnpj-unico', 'Loja', 'Loja'),
    ('${OUTRA}', 'cnpj-outra-org', 'Outra loja', 'Outra loja');
  insert into public.contacts (organization_id, name, custom_fields) values
    ('${ORG}', 'Cliente original', '${CNPJ_COM_MASCARA}'),
    ('${OUTRA}', 'Cliente de outra loja', '${CNPJ}'),
    ('${ORG}', 'Cliente sem documento 1', '{}'),
    ('${ORG}', 'Cliente sem documento 2', '{}');
`;

const provarBloqueio = `
  do $$
  declare
    indice text;
  begin
    begin
      insert into public.contacts (organization_id, name, custom_fields)
        values ('${ORG}', 'Novo cliente', '${CNPJ}');
      raise exception 'CNPJ repetido no cadastro foi aceito';
    exception when unique_violation then
      get stacked diagnostics indice = constraint_name;
      if indice <> 'uniq_contacts_org_cnpj' then raise; end if;
    end;
    begin
      update public.contacts set custom_fields = '${CNPJ}'
        where organization_id = '${ORG}' and name = 'Cliente sem documento 1';
      raise exception 'CNPJ repetido na edição foi aceito';
    exception when unique_violation then
      get stacked diagnostics indice = constraint_name;
      if indice <> 'uniq_contacts_org_cnpj' then raise; end if;
    end;
  end
  $$;
`;

describe("CNPJ único por organização", () => {
  it("o baseline bloqueia duplicidade na criação e na edição", () => {
    expect(sql(`${preparar}${provarBloqueio} select 'ok'; rollback;`)).toContain("ok");
  });

  it("preserva duplicados antigos e impede novos conflitos ao atualizar", () => {
    const migration = readFileSync(
      new URL("../../supabase/migrations/20261121200000_9057_cnpj_unico_no_cadastro_de_clientes.sql", import.meta.url),
      "utf8",
    );
    const resultado = sql(`
      ${preparar}
      drop index public.uniq_contacts_org_cnpj;
      insert into public.contacts (organization_id, name, custom_fields)
        values ('${ORG}', 'Cliente antigo duplicado', '${CNPJ}');
      ${migration}
      ${provarBloqueio}
      update public.contacts set name = 'Cliente antigo editado'
        where organization_id = '${ORG}' and name = 'Cliente antigo duplicado';
      select count(*) from public.contacts
        where organization_id = '${ORG}' and custom_fields ? 'cadastro_cliente';
      rollback;
    `);
    expect(resultado.split("\n")).toContain("2");
  });
});
