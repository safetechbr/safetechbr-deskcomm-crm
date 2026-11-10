import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, seedGov, countAs, GOV_ORG as ORG, GOV_AGENT_A as A, GOV_AGENT_B as B, GOV_MANAGER as M, GOV_VIEWER as VIEWER, GOV_CONV_UNASSIGNED as CONV, GOV_SESSION as SESSION, GOV_CONTACT_1 as CONTACT } from "./gov-helpers";
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT}/postgres`, max: 4 });
const OUTRA = "edc00360-0000-4000-8000-000000000001";
async function como(user: string, query: string, args: unknown[] = []) {
  const c = await pool.connect();
  try {
    await c.query("begin"); await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
    const r = await c.query(query,args); await c.query("commit"); return r;
  } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
}
async function carro(status = "disponivel", org = ORG) {
  const id = randomUUID(); await pool.query("insert into veiculos(id,organization_id,codigo,modelo,status) values($1::uuid,$2,$1::text,'Carro de teste',$3)",[id,org,status]); return id;
}
async function reservar(user: string, id: string, horas = 24, org = ORG) {
  const r = await como(user,"select fn_reservar_veiculo($1,$2,$3,$4) as r",[org,id,CONV,horas]); return r.rows[0].r;
}
async function liberar(user: string, id: string, reserva: string) {
  return como(user,"select fn_liberar_reserva_veiculo($1,$2,$3) as liberou",[ORG,id,reserva]);
}
beforeAll(() => {
  seedGov();
  sql(`insert into organizations(id,slug,legal_name,display_name) values('${OUTRA}','reserva-outra','Outra','Outra') on conflict do nothing;`);
});
afterAll(async () => pool.end());

describe("reserva do estoque — banco real", () => {
  it("duas aquisições simultâneas: só uma ganha; a outra recebe conflito", async () => {
    const v = await carro();
    const resultados = await Promise.allSettled([reservar(A,v),reservar(B,v)]);
    expect(resultados.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const erro = resultados.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(erro.reason.code).toBe("PT409");
    expect((await pool.query("select count(*)::int as n from reservas_de_veiculo where veiculo_id=$1 and encerrada_em is null",[v])).rows[0].n).toBe(1);
  });
  it("padrão 24 horas; repetir não renova prazo nem cria outra reserva", async () => {
    const v=await carro(); const r=await reservar(A,v); const outro=await reservar(A,v);
    expect(outro.id).toBe(r.id); expect(outro.expira_em).toBe(r.expira_em);
    expect(Date.parse(r.expira_em)-Date.parse(r.criada_em)).toBe(86400000);
  });
  it("limite de 24h e papel viewer não reservam", async () => {
    const v=await carro();
    await expect(reservar(A,v,25)).rejects.toMatchObject({ code: "PT422" });
    await expect(reservar(VIEWER,v)).rejects.toMatchObject({ code: "42501" });
  });
  it("isolamento real entre organizações e tabela sem escrita direta", async () => {
    const v=await carro(); await reservar(A,v);
    expect(countAs(A,`select count(*) from reservas_de_veiculo where organization_id='${OUTRA}';`)).toBe(0);
    await expect(reservar(A,await carro("disponivel",OUTRA),24,OUTRA)).rejects.toMatchObject({ code: "42501" });
    await expect(como(A,"delete from reservas_de_veiculo where veiculo_id=$1",[v])).rejects.toMatchObject({ code: "42501" });
  });
  it("somente o dono ou gerente libera; requisição antiga não libera reserva nova", async () => {
    const v=await carro(); const r=await reservar(A,v);
    await expect(liberar(B,v,r.id)).rejects.toMatchObject({ code: "42501" });
    await liberar(M,v,r.id); const nova=await reservar(B,v);
    await liberar(A,v,r.id);
    expect((await pool.query("select encerrada_em from reservas_de_veiculo where id=$1",[nova.id])).rows[0].encerrada_em).toBeNull();
  });
  it("vencimento devolve disponibilidade sem cron e permite outro vendedor", async () => {
    const v=await carro(); const r=await reservar(A,v);
    await pool.query("update reservas_de_veiculo set criada_em=now()-interval '25 hours',expira_em=now()-interval '1 hour' where id=$1",[r.id]);
    const nova=await reservar(B,v); expect(nova.vendedor_user_id).toBe(B);
    expect((await pool.query("select motivo_encerramento from reservas_de_veiculo where id=$1",[r.id])).rows[0].motivo_encerramento).toBe("expirada");
  });
  it("carro vendido ou bloqueado administrativamente nunca é reservado", async () => {
    for (const status of ["vendido","reservado"]) await expect(reservar(A,await carro(status))).rejects.toMatchObject({ code: "PT409" });
  });
  it("venda por outro vendedor é barrada no banco; venda do dono encerra a reserva", async () => {
    const v=await carro(); const r=await reservar(A,v);
    await expect(como(M,"update veiculos set status='vendido' where id=$1",[v])).rejects.toMatchObject({ code: "PT409" });
    const venda=randomUUID();
    await pool.query("insert into negociacoes_de_veiculo(id,organization_id,numero,tipo,veiculo_id,vendedor_user_id) values($1,$2,9001,'venda',$3,$4)",[venda,ORG,v,A]);
    await expect(como(B,"select fn_concluir_negociacao_de_veiculo($1)",[venda])).rejects.toMatchObject({code:"PT409"});
    await como(A,"select fn_concluir_negociacao_de_veiculo($1)",[venda]);
    expect((await pool.query("select motivo_encerramento from reservas_de_veiculo where id=$1",[r.id])).rows[0].motivo_encerramento).toBe("vendida");
  });
  it("texto/foto/vídeo preparados não entram por outro vendedor; dono envia", async () => {
    const v=await carro(); await reservar(A,v);
    const q="insert into messages(organization_id,conversation_id,channel_session_id,contact_id,type,direction,status,body,sent_by_user_id,metadata) values($1,$2,$3,$4,$5,'outbound','queued','Ficha de teste',$6,$7)";
    for(const tipo of ["text","image","video"]) {
      await expect(como(B,q,[ORG,CONV,SESSION,CONTACT,tipo,B,JSON.stringify({veiculo_id:v})])).rejects.toMatchObject({code:"PT409"});
    }
    await como(A,q,[ORG,CONV,SESSION,CONTACT,"text",A,JSON.stringify({veiculo_id:v})]);
  });
  it("foto preparada sem metadata também é barrada", async () => {
    const v=await carro(); const arquivo=`${randomUUID()}.jpg`;
    await pool.query("update veiculos set fotos=$1 where id=$2",[[`${ORG}/${v}/${arquivo}`],v]); await reservar(A,v);
    await expect(como(B,"insert into messages(organization_id,conversation_id,channel_session_id,contact_id,type,direction,status,media_storage_path,sent_by_user_id) values($1,$2,$3,$4,'image','outbound','queued',$5,$6)",[ORG,CONV,SESSION,CONTACT,`${ORG}/${CONV}/veiculo-${arquivo}`,B])).rejects.toMatchObject({code:"PT409"});
  });
});

describe("controle da proteção de envio", () => {
  it("o mesmo envio passa se o gatilho for sabotado; rollback restaura o banco", async () => {
    const v=await carro(); await reservar(A,v);
    const c=await pool.connect();
    try {
      await c.query("begin");
      await c.query("alter table public.messages disable trigger trg_mensagem_confere_reserva_veiculo");
      const r=await c.query("insert into messages(organization_id,conversation_id,channel_session_id,contact_id,type,direction,status,body,sent_by_user_id,metadata) values($1,$2,$3,$4,'text','outbound','queued','Controle negativo',$5,$6) returning id",[ORG,CONV,SESSION,CONTACT,B,JSON.stringify({veiculo_id:v})]);
      expect(r.rowCount).toBe(1);
    } finally { await c.query("rollback"); c.release(); }
    expect(sql("select tgenabled from pg_trigger where tgname='trg_mensagem_confere_reserva_veiculo';")).toBe("O");
  });
});
