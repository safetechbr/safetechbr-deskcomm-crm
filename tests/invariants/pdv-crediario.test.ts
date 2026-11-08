import { beforeAll, describe, it, expect } from "vitest";
import {
  seedGov,
  sql,
  GOV_ORG,
  GOV_MANAGER,
  GOV_AGENT_A,
  GOV_VIEWER,
  lastLine,
} from "./gov-helpers";
const VENDA = "fa000000-0000-4000-8000-000000000001",
  CONTA = "fa000000-0000-4000-8000-000000000002";
beforeAll(() => {
  seedGov();
  sql(
    `insert into financial_accounts(id,organization_id,name,kind,currency) values('${CONTA}','${GOV_ORG}','Conta teste','cash','BRL'); insert into negociacoes_de_veiculo(id,organization_id,numero,tipo,valor_cents,pagamentos) values('${VENDA}','${GOV_ORG}',9001,'venda',10000,'[{"forma":"crediario","valor_cents":10000,"parcelas":3,"primeiro_vencimento":"2027-01-31","conta_id":"${CONTA}","juros_bps":0}]'); update negociacoes_de_veiculo set status='concluida' where id='${VENDA}';`,
  );
});
function operar(user: string, op: string, dados: object) {
  return sql(
    `set role authenticated;select set_config('request.jwt.claims','{"sub":"${user}"}',false); select fn_pdv_crediario_operar('${VENDA}','${op}','${JSON.stringify(dados)}');`,
  );
}
describe("crediário transacional", () => {
  it("gera parcelas exatas e ancora o vencimento mensal no dia original", () => {
    expect(
      sql(
        `select string_agg(amount_cents::text,',' order by parcela_numero) from financial_entries where negociacao_id='${VENDA}'`,
      ),
    ).toBe("3334,3333,3333");
    expect(
      sql(
        `select string_agg(due_date::text,',' order by parcela_numero) from financial_entries where negociacao_id='${VENDA}'`,
      ),
    ).toBe("2027-01-31,2027-02-28,2027-03-31");
  });
  it("nega a operação de quem só lê", () => {
    expect(() =>
      operar(GOV_VIEWER, "recalcular", { parcelas: 2, vencimento: "2027-01-01" }),
    ).toThrow();
  });
  it("recebe uma única vez e recalcula somente saldo pendente", () => {
    const id = sql(
      `select id from financial_entries where negociacao_id='${VENDA}' order by parcela_numero limit 1`,
    );
    operar(GOV_AGENT_A, "receber", { parcela_id: id });
    operar(GOV_AGENT_A, "receber", { parcela_id: id });
    operar(GOV_MANAGER, "recalcular", { parcelas: 2, vencimento: "2027-04-30", juros_bps: 0 });
    expect(sql(`select amount_cents from financial_entries where id='${id}'`)).toBe("3334");
    expect(
      sql(`select sum(amount_cents) from financial_entries where negociacao_id='${VENDA}'`),
    ).toBe("10000");
    expect(() =>
      operar(GOV_MANAGER, "editar", { parcela_id: id, valor_cents: 1, vencimento: "2027-01-01" }),
    ).toThrow();
    expect(
      lastLine(
        sql(
          `set role authenticated; select set_config('request.jwt.claims','{"sub":"${GOV_MANAGER}"}',false);select count(*) from financial_entries where negociacao_id='${VENDA}'`,
        ),
      ),
    ).toBe("3");
  });
  it("não duplica parcelas ao atualizar novamente a venda concluída", () => {
    const antes = sql(`select count(*) from financial_entries where negociacao_id='${VENDA}'`);
    sql(`update negociacoes_de_veiculo set status='concluida' where id='${VENDA}'`);
    expect(sql(`select count(*) from financial_entries where negociacao_id='${VENDA}'`)).toBe(
      antes,
    );
  });
  it("juros incidem somente sobre o saldo, sem alterar o que foi recebido", () => {
    operar(GOV_MANAGER, "recalcular", { parcelas: 3, vencimento: "2027-07-31", juros_bps: 1000 });
    expect(
      sql(
        `select sum(amount_cents) from financial_entries where negociacao_id='${VENDA}' and status='pending'`,
      ),
    ).toBe("7333");
    expect(
      sql(
        `select sum(amount_cents) from financial_entries where negociacao_id='${VENDA}' and status='paid'`,
      ),
    ).toBe("3334");
  });
  it("não expõe nem permite receber parcela de outra empresa",()=>{
    const org='fa000000-0000-4000-8000-000000000010',conta='fa000000-0000-4000-8000-000000000011',venda='fa000000-0000-4000-8000-000000000012';
    sql(`insert into organizations(id,slug,legal_name,display_name) values('${org}','credito-isolado','Teste','Teste');insert into financial_accounts(id,organization_id,name,kind,currency) values('${conta}','${org}','Conta isolada','cash','BRL');insert into negociacoes_de_veiculo(id,organization_id,numero,tipo,valor_cents,pagamentos) values('${venda}','${org}',1,'venda',1000,'[{"forma":"crediario","valor_cents":1000,"parcelas":1,"primeiro_vencimento":"2027-01-01","conta_id":"${conta}"}]');update negociacoes_de_veiculo set status='concluida' where id='${venda}';`);
    expect(sql(`select count(*) from financial_entries where negociacao_id='${venda}'`)).toBe('1');
    expect(lastLine(sql(`set role authenticated;select set_config('request.jwt.claims','{"sub":"${GOV_MANAGER}"}',false);select count(*) from financial_entries where negociacao_id='${venda}'`))).toBe('0');
    expect(()=>sql(`set role authenticated;select set_config('request.jwt.claims','{"sub":"${GOV_MANAGER}"}',false);select fn_pdv_crediario_operar('${venda}','recalcular','{"parcelas":2,"vencimento":"2027-01-01"}');`)).toThrow();
  });

});
