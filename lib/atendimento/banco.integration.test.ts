// Integração opcional: usa somente dados sintéticos e desfaz TODA a transação.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
const require = createRequire(import.meta.url);
const url = process.env.ATENDIMENTO_DB_TEST_URL;

describe.skipIf(!url)("atendimento protegido no Postgres real", () => {
  it("assume, identifica todos os canais e só permite liberar pelo dono ou substituir com senha", async () => {
    const { Client } = require("pg");
    const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await db.connect();
    const org = randomUUID(),
      outra = randomUUID(),
      a = randomUUID(),
      b = randomUUID(),
      admin = randomUUID(),
      manager = randomUUID(),
      viewer = randomUUID(),
      contato = randomUUID(),
      sessao1 = randomUUID(),
      sessao2 = randomUUID(),
      sessao3 = randomUUID(),
      c1 = randomUUID(),
      c2 = randomUUID(),
      historico = randomUUID();
    const q = (s: string, p?: unknown[]) => db.query(s, p);
    const mudar = async (
      actor: string,
      acao: string,
      senha: string | null = null,
      expected: string | null = null,
      conv: string | null = c1,
      orgId = org,
    ) =>
      (
        await q("select public.fn_atendimento_alterar($1,$2,$3,$4,$5,$6,$7) r", [
          orgId,
          actor,
          contato,
          conv,
          acao,
          senha,
          expected,
        ])
      ).rows[0].r;
    async function recusa(sql: string, args: unknown[], mensagem: string) {
      await q("savepoint recusa");
      await expect(q(sql, args)).rejects.toThrow(mensagem);
      await q("rollback to savepoint recusa");
    }
    await q("begin");
    try {
      const migration = readFileSync(
        "supabase/migrations/20261113155054_9041_atendimento_protegido_por_vendedor.sql",
        "utf8",
      );
      await q(migration);
      await q(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"full_name\":\"Vendedor A\"}'),($3,$4,'{\"full_name\":\"Vendedor B\"}'),($5,$6,'{}'),($7,$8,'{}'),($9,$10,'{}')",
        [
          a,
          `${a}@teste.invalid`,
          b,
          `${b}@teste.invalid`,
          admin,
          `${admin}@teste.invalid`,
          manager,
          `${manager}@teste.invalid`,
          viewer,
          `${viewer}@teste.invalid`,
        ],
      );
      await q(
        "insert into public.organizations(id,slug,legal_name,display_name,settings) values($1,$2,'Teste','Teste',$5),($3,$4,'Outra','Outra',$5)",
        [
          org,
          `atendimento-${org}`,
          outra,
          `atendimento-${outra}`,
          JSON.stringify({ visibility_mode: "all" }),
        ],
      );
      for (const [id, role] of [
        [a, "agent"],
        [b, "agent"],
        [admin, "admin"],
        [manager, "manager"],
        [viewer, "viewer"],
      ])
        await q(
          "insert into public.user_organizations(organization_id,user_id,role,accepted_at) values($1,$2,$3,now())",
          [org, id, role],
        );
      await q(
        "insert into public.contacts(id,organization_id,display_name) values($1,$2,'Cliente sintético')",
        [contato, org],
      );
      await q(
        "insert into public.channel_sessions(id,organization_id,display_name,webhook_secret_encrypted,waha_session_name) values($1,$2,'Canal 1','teste',$1::uuid::text),($3,$2,'Canal 2','teste',$3::uuid::text)",
        [sessao1, org, sessao2],
      );
      await q(
        "insert into public.conversations(id,organization_id,contact_id,status,channel_session_id) values($1,$2,$3,'open',$5),($4,$2,$3,'open',$6)",
        [c1, org, contato, c2, sessao1, sessao2],
      );
      await q(
        "insert into public.channel_sessions(id,organization_id,display_name,webhook_secret_encrypted,waha_session_name) values($1,$2,'Canal histórico','teste',$1::uuid::text)",
        [sessao3, org],
      );
      await q(
        "insert into public.conversations(id,organization_id,contact_id,status,channel_session_id,assigned_to_user_id,assigned_to_user_name,assignee_kind) values($1,$2,$3,'closed',$4,$5,'Vendedor B','user')",
        [historico, org, contato, sessao3, b],
      );
      expect((await mudar(viewer, "assumir")).erro).toBe("permissao_negada");
      expect((await mudar(a, "assumir", null, null, c1, outra)).erro).toBe("permissao_negada");
      const assumiu = await mudar(a, "assumir");
      expect(assumiu.dono_user_id).toBe(a);
      const canais = (
        await q(
          "select assigned_to_user_id,assigned_to_user_name,bot_silenced_until from public.conversations where organization_id=$1 and status not in ('closed','archived','resolved')",
          [org],
        )
      ).rows;
      expect(canais).toHaveLength(2);
      for (const canal of canais) {
        expect(canal.assigned_to_user_id).toBe(a);
        expect(canal.assigned_to_user_name).toBe("Vendedor A");
        expect(canal.bot_silenced_until).toBe(Infinity);
      }
      expect((await mudar(b, "assumir", null, a)).erro).toBe("senha_necessaria");
      expect((await mudar(b, "liberar")).erro).toBe("somente_responsavel");
      expect((await mudar(b, "assumir", "SenhaTeste123", null)).erro).toBe("conflito");
      expect((await mudar(b, "assumir", "SenhaTeste123", a)).erro).toBe("senha_nao_configurada");
      await recusa(
        "select public.fn_atendimento_definir_senha($1,$2,'SenhaTeste123')",
        [org, manager],
        "atendimento_admin_necessario",
      );
      await q("select public.fn_atendimento_definir_senha($1,$2,'SenhaTeste123')", [org, admin]);
      expect(
        (
          await q("select senha_hash from public.atendimento_senhas where organization_id=$1", [
            org,
          ])
        ).rows[0].senha_hash,
      ).not.toContain("SenhaTeste123");
      expect((await mudar(b, "assumir", "Errada123", a)).erro).toBe("senha_incorreta");
      expect(
        (
          await q(
            "select falhas from public.atendimento_tentativas where organization_id=$1 and user_id=$2",
            [org, b],
          )
        ).rows[0].falhas,
      ).toBe(1);
      const substituiu = await mudar(b, "assumir", "SenhaTeste123", a);
      expect(substituiu.dono_user_id).toBe(b);
      expect(substituiu.autorizado_por_senha).toBe(true);
      await q("select public.fn_atendimento_definir_senha($1,$2,'SenhaNova123')", [org, admin]);
      expect((await mudar(a, "assumir", "SenhaTeste123", b)).erro).toBe("senha_incorreta");
      for (let i = 0; i < 4; i++)
        expect((await mudar(a, "assumir", "Errada123", b)).erro).toBe("senha_incorreta");
      expect((await mudar(a, "assumir", "SenhaNova123", b)).erro).toBe("tentativas_excedidas");
      // Expiração da janela e invalidação da senha anterior.
      await q(
        "update public.atendimento_tentativas set janela=now()-interval '16 minutes' where organization_id=$1 and user_id=$2",
        [org, a],
      );
      expect((await mudar(a, "assumir", "SenhaNova123", b)).dono_user_id).toBe(a);
      // A variável autorizada só existe dentro da transação RPC, não é um ticket reaproveitável.
      await q("select set_config('app.atendimento_autorizado','',true)");
      await q("select set_config('request.jwt.claim.sub',$1,true)", [b]);
      await recusa(
        "select public.fn_conversation_assign($1,$2,$3,'claim',$4,true)",
        [org, c1, b, a],
        "atendimento_senha_necessaria",
      );
      await recusa(
        "select public.fn_definir_carteira_do_cliente($1,$2,$3,$4,'manual')",
        [org, admin, contato, b],
        "atendimento_senha_necessaria",
      );
      expect((await mudar(a, "liberar")).dono_user_id).toBeNull();
      expect(
        (
          await q(
            "select count(*) n from public.conversations where organization_id=$1 and assigned_to_user_id is not null and status not in ('closed','archived','resolved')",
            [org],
          )
        ).rows[0].n,
      ).toBe("0");
      expect((await mudar(b, "assumir")).dono_user_id).toBe(b);
      expect(
        (
          await q("select status,assigned_to_user_id from public.conversations where id=$1", [
            historico,
          ])
        ).rows[0],
      ).toEqual({ status: "closed", assigned_to_user_id: b });
      // Hashes, contadores e RPCs privilegiados não são alcançáveis por sessão/anon.
      const acl = (
        await q(
          "select has_table_privilege('authenticated','public.atendimento_senhas','select') s,has_table_privilege('anon','public.atendimento_senhas','select') a,has_function_privilege('authenticated','public.fn_atendimento_alterar(uuid,uuid,uuid,uuid,text,text,uuid)','execute') f",
        )
      ).rows[0];
      expect(acl).toEqual({ s: false, a: false, f: false });
    } finally {
      await q("rollback");
      await db.end();
    }
  }, 30000);
});
