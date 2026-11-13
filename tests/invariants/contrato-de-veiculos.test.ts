import { beforeAll, describe, expect, it } from "vitest";
import { seedGov, sql, GOV_ORG, GOV_AGENT_A, GOV_VIEWER, lastLine } from "./gov-helpers";
const GOV_ORG_OTHER = "fb000000-0000-4000-8000-000000000099";
const ID = "fb000000-0000-4000-8000-000000000001";
beforeAll(() => {
  seedGov();
  sql(
    `insert into organizations(id,slug,legal_name,display_name) values('${GOV_ORG_OTHER}','contrato-outra','Outra','Outra');`,
  );
});
describe("dados contratuais do estoque", () => {
  it("há dados de outra organização, invisíveis para o agente", () => {
    sql(
      `insert into negociacoes_de_veiculo(organization_id,numero,tipo,contrato) values('${GOV_ORG_OTHER}',1,'compra','{"empresa":{"razao_social":"Outra loja"}}');`,
    );
    expect(
      sql(`select count(*) from negociacoes_de_veiculo where organization_id='${GOV_ORG_OTHER}'`),
    ).toBe("1");
    expect(
      lastLine(
        sql(
          `set role authenticated;select set_config('request.jwt.claims','{"sub":"${GOV_AGENT_A}"}',false);select count(*) from negociacoes_de_veiculo where organization_id='${GOV_ORG_OTHER}'`,
        ),
      ),
    ).toBe("0");
  });
  it("completa o veículo da troca sem reescrever os dados do veículo vendido", () => {
    const carro = "fb000000-0000-4000-8000-000000000002";
    const venda = "fb000000-0000-4000-8000-000000000003";
    sql(`insert into veiculos(id,organization_id,codigo,modelo,condicao,regularizacao) values('${carro}','${GOV_ORG}','CONTRATO-TESTE','Carro vendido','novo','[]');
      insert into negociacoes_de_veiculo(id,organization_id,numero,tipo,veiculo_id,veiculo,troca) values('${venda}','${GOV_ORG}',8103,'venda','${carro}','{"modelo":"Carro vendido","condicao":"usado"}','{"modelo":"Troca de teste","condicao":"usado","regularizacao":[{"descricao":"IPVA","responsavel":"cliente","valor_cents":10000}]}');`);
    sql(
      `set role authenticated;select set_config('request.jwt.claims','{"sub":"${GOV_AGENT_A}"}',false);select fn_concluir_negociacao_de_veiculo('${venda}');`,
    );
    expect(sql(`select condicao from veiculos where id='${carro}'`)).toBe("novo");
    expect(
      sql(
        `select regularizacao->0->>'descricao' from veiculos where id=(select troca_veiculo_id from negociacoes_de_veiculo where id='${venda}')`,
      ),
    ).toBe("IPVA");
  });
  it("carrega condição e pendências para o veículo comprado, dentro da transação", () => {
    sql(
      `insert into negociacoes_de_veiculo(id,organization_id,numero,tipo,valor_cents,veiculo,contrato) values('${ID}','${GOV_ORG}',8101,'compra',100000,'{"modelo":"Carro de teste","condicao":"usado","regularizacao":[{"descricao":"Licenciamento","responsavel":"loja","valor_cents":12345}]}','{"empresa":{"razao_social":"Loja Exemplo"}}');`,
    );
    sql(
      `set role authenticated;select set_config('request.jwt.claims','{"sub":"${GOV_AGENT_A}"}',false);select fn_concluir_negociacao_de_veiculo('${ID}');`,
    );
    expect(
      sql(
        `select condicao from veiculos where id=(select veiculo_id from negociacoes_de_veiculo where id='${ID}')`,
      ),
    ).toBe("usado");
    expect(
      sql(
        `select regularizacao->0->>'valor_cents' from veiculos where id=(select veiculo_id from negociacoes_de_veiculo where id='${ID}')`,
      ),
    ).toBe("12345");
    expect(
      lastLine(
        sql(
          `set role authenticated;select set_config('request.jwt.claims','{"sub":"${GOV_AGENT_A}"}',false);select count(*) from negociacoes_de_veiculo where organization_id='${GOV_ORG_OTHER}'`,
        ),
      ),
    ).toBe("0");
  });
  it("mantém a autorização existente para quem só pode ler", () => {
    expect(() =>
      sql(
        `set role authenticated;select set_config('request.jwt.claims','{"sub":"${GOV_VIEWER}"}',false);insert into negociacoes_de_veiculo(organization_id,numero,tipo,contrato) values('${GOV_ORG}',8102,'compra','{}');`,
      ),
    ).toThrow();
  });
  it("rejeita formato inválido dos campos novos no banco", () => {
    expect(() =>
      sql(`update organizations set dados_contrato='[]' where id='${GOV_ORG}'`),
    ).toThrow();
    expect(() => sql(`update negociacoes_de_veiculo set contrato='[]' where id='${ID}'`)).toThrow();
    expect(() =>
      sql(
        `update veiculos set regularizacao='{}' where id=(select veiculo_id from negociacoes_de_veiculo where id='${ID}')`,
      ),
    ).toThrow();
  });
});
