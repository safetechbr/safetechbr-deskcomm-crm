import { beforeAll, describe, it, expect } from "vitest";
import { seedGov, sql, GOV_ORG, GOV_AGENT_A, GOV_VIEWER, lastLine } from "./gov-helpers";
const C = "fb000000-0000-4000-8000-000000000040";
const D = "fb000000-0000-4000-8000-000000000041";
beforeAll(() => {
  seedGov();
  sql(
    `insert into contacts(id,organization_id,name) values('${C}','${GOV_ORG}','Cliente fictício');insert into contact_documents(id,organization_id,contact_id,kind,file_name,file_size,mime_type,storage_path) values('${D}','${GOV_ORG}','${C}','residencia','teste.pdf',12,'application/pdf','${GOV_ORG}/contacts/${C}/${D}');`,
  );
});
describe("documentos do cliente", () => {
  it("agente lê seus documentos e viewer não lê documentos pessoais", () => {
    const ler = (u: string) =>
      lastLine(
        sql(
          `set role authenticated;select set_config('request.jwt.claims','{"sub":"${u}"}',false);select count(*) from contact_documents where id='${D}';`,
        ),
      );
    expect(ler(GOV_AGENT_A)).toBe("1");
    expect(ler(GOV_VIEWER)).toBe("0");
  });
  it("outra organização não enxerga registros e não aceita vínculo cruzado", () => {
    const org = "fb000000-0000-4000-8000-000000000042";
    sql(
      `insert into organizations(id,slug,legal_name,display_name) values('${org}','docs-outra','Outra','Outra');insert into contacts(id,organization_id,name) values('fb000000-0000-4000-8000-000000000043','${org}','Outro');insert into contact_documents(organization_id,contact_id,kind,file_name,file_size,mime_type,storage_path) values('${org}','fb000000-0000-4000-8000-000000000043','identidade','outro.pdf',10,'application/pdf','${org}/contacts/fb000000-0000-4000-8000-000000000043/teste');`,
    );
    expect(
      lastLine(
        sql(
          `set role authenticated;select set_config('request.jwt.claims','{"sub":"${GOV_AGENT_A}"}',false);select count(*) from contact_documents where organization_id='${org}'`,
        ),
      ),
    ).toBe("0");
    expect(() =>
      sql(
        `set role authenticated;select set_config('request.jwt.claims','{"sub":"${GOV_AGENT_A}"}',false);insert into contact_documents(organization_id,contact_id,kind,file_name,file_size,mime_type,storage_path) values('${GOV_ORG}','fb000000-0000-4000-8000-000000000043','identidade','teste.pdf',10,'application/pdf','${GOV_ORG}/contacts/fb000000-0000-4000-8000-000000000043/teste')`,
      ),
    ).toThrow();
  });
  it("não expõe bucket nem libera Storage diretamente", () => {
    expect(sql("select public from storage.buckets where id='client-documents'")).toBe("f");
  });
  it("remover registro enfileira o original para expurgo", () => {
    sql(`delete from contact_documents where id='${D}'`);
    expect(
      sql(
        `select count(*) from storage_redaction_queue where bucket='client-documents' and object_path='${GOV_ORG}/contacts/${C}/${D}'`,
      ),
    ).toBe("1");
  });
});
