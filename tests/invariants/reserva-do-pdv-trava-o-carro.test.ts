import { beforeAll, describe, it, expect } from "vitest";
import { seedGov, sql, GOV_ORG } from "./gov-helpers";

// Migration 9048: reserva do PDV com prazo trava o carro e o solta ao cancelar ou vencer.
const CARRO = "fb000000-0000-4000-8000-000000000001";
const R1 = "fb000000-0000-4000-8000-000000000002";
const R2 = "fb000000-0000-4000-8000-000000000003";
const status = () => sql(`select status from veiculos where id='${CARRO}'`);
const reservar = (id: string, numero: number, prazo = "now() + interval '3 days'") =>
  sql(
    `insert into negociacoes_de_veiculo(id,organization_id,numero,tipo,modalidade,veiculo_id,valor_cents,reserva_expira_em) values('${id}','${GOV_ORG}',${numero},'venda','reserva','${CARRO}',10000,${prazo})`,
  );

beforeAll(() => {
  seedGov();
  sql(
    `insert into veiculos(id,organization_id,codigo,modelo,status) values('${CARRO}','${GOV_ORG}','RESERVA-PDV','Carro reservado','disponivel')`,
  );
});

describe("reserva do PDV trava o carro", () => {
  it("reserva com prazo marca o carro como reservado e recusa a segunda", () => {
    reservar(R1, 9101);
    expect(status()).toBe("reservado");
    expect(() => reservar(R2, 9102)).toThrow(/reservado em outra negociação/);
  });

  it("outra venda do mesmo carro não conclui enquanto a reserva vale", () => {
    sql(
      `insert into negociacoes_de_veiculo(id,organization_id,numero,tipo,veiculo_id,valor_cents) values('${R2}','${GOV_ORG}',9102,'venda','${CARRO}',10000)`,
    );
    expect(() =>
      sql(`update negociacoes_de_veiculo set status='concluida' where id='${R2}'`),
    ).toThrow(/veiculo_reservado/);
    sql(`delete from negociacoes_de_veiculo where id='${R2}'`);
  });

  it("cancelar a reserva devolve o carro", () => {
    sql(`update negociacoes_de_veiculo set status='cancelada' where id='${R1}'`);
    expect(status()).toBe("disponivel");
  });

  it("reserva vencida solta o carro na liberação preguiçosa", () => {
    reservar(R2, 9103);
    expect(status()).toBe("reservado");
    sql(`alter table negociacoes_de_veiculo disable trigger trg_pdv_reserva_trava_veiculo`);
    sql(
      `update negociacoes_de_veiculo set reserva_expira_em=now() - interval '1 minute' where id='${R2}'`,
    );
    sql(`alter table negociacoes_de_veiculo enable trigger trg_pdv_reserva_trava_veiculo`);
    expect(sql(`select fn_pdv_liberar_reservas_vencidas('${GOV_ORG}')`)).toBe("1");
    expect(status()).toBe("disponivel");
  });

  it("a mesma negociação renova o prazo e trava de novo", () => {
    sql(
      `update negociacoes_de_veiculo set reserva_expira_em=now() + interval '2 days' where id='${R2}'`,
    );
    expect(status()).toBe("reservado");
  });
});
