-- manifest: Atendimento por vendedor: assumir/liberar o cliente e suas conversas em uma transação, com senha administrativa para substituição. Senha com bcrypt, tentativas limitadas por usuário e organização, escrita apenas pelo servidor e proteção dos caminhos antigos de atribuição.

create table if not exists public.atendimento_senhas (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  senha_hash text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.atendimento_senhas enable row level security;
revoke all on public.atendimento_senhas from public, anon, authenticated;
grant select, insert, update, delete on public.atendimento_senhas to service_role;

create table if not exists public.atendimento_tentativas (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  falhas integer not null default 0,
  janela timestamptz not null default now(),
  primary key (organization_id, user_id)
);
alter table public.atendimento_tentativas enable row level security;
revoke all on public.atendimento_tentativas from public, anon, authenticated;
grant select, insert, update, delete on public.atendimento_tentativas to service_role;

create or replace function public.fn_atendimento_definir_senha(p_org uuid, p_actor uuid, p_senha text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.fn_support_write_allowed(p_org)
     or not exists(select 1 from public.user_organizations where organization_id=p_org and user_id=p_actor and role='admin' and accepted_at is not null and revoked_at is null) then
    raise exception 'atendimento_admin_necessario' using errcode='42501';
  end if;
  if p_senha is null or char_length(p_senha)<8 or octet_length(p_senha)>72 then
    raise exception 'atendimento_senha_invalida' using errcode='22023';
  end if;
  insert into public.atendimento_senhas(organization_id,senha_hash,updated_by)
  values(p_org,extensions.crypt(p_senha,extensions.gen_salt('bf',10)),p_actor)
  on conflict(organization_id) do update set senha_hash=excluded.senha_hash,updated_by=excluded.updated_by,updated_at=now();
  -- Alterar a senha não apaga os bloqueios: evita contornar a janela de tentativas.
end;
$$;
revoke execute on function public.fn_atendimento_definir_senha(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fn_atendimento_definir_senha(uuid,uuid,text) to service_role;

-- Defesa dos RPCs antigos, UPDATE REST, transferência, lote e automações.
create or replace function public.fn_atendimento_proteger_atribuicao()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_dono uuid; v_ator uuid := auth.uid();
begin
  if (tg_op='UPDATE' and new.assigned_to_user_id is not distinct from old.assigned_to_user_id)
     or (tg_op='INSERT' and new.assigned_to_user_id is null) then return new; end if;
  if current_setting('app.atendimento_autorizado',true)=new.organization_id::text || ':' || coalesce(new.contact_id::text,new.id::text) then return new; end if;
  select c.carteira_user_id into v_dono from public.contacts c
    where c.id=new.contact_id and c.organization_id=new.organization_id;
  if old.assigned_to_user_id is not null
     and public.fn_member_role_in_org(old.assigned_to_user_id,new.organization_id) in ('agent','manager','admin')
     and (v_ator is distinct from old.assigned_to_user_id or new.assigned_to_user_id is not null) then
    raise exception 'atendimento_senha_necessaria' using errcode='PT403';
  end if;
  if v_dono is not null and new.assigned_to_user_id is not null and new.assigned_to_user_id<>v_dono
     and public.fn_member_role_in_org(v_dono,new.organization_id) in ('agent','manager','admin') then
    raise exception 'atendimento_senha_necessaria' using errcode='PT403';
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_atendimento_proteger_atribuicao() from public,anon,authenticated;
drop trigger if exists trg_atendimento_proteger_atribuicao on public.conversations;
create trigger trg_atendimento_proteger_atribuicao before insert or update of assigned_to_user_id on public.conversations
for each row execute function public.fn_atendimento_proteger_atribuicao();

-- A chamada é apenas de servidor, depois do requireRole; o ator nunca vem do body.
-- Erros de senha são DADOS, não exceptions: a contagem precisa COMMITAR mesmo na recusa.
create or replace function public.fn_atendimento_alterar(
 p_org uuid, p_actor uuid, p_contact uuid, p_conversation uuid,
 p_acao text, p_senha text default null, p_expected uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_dono uuid; v_conv public.conversations%rowtype; v_result public.conversations%rowtype;
 v_c uuid; v_hash text; v_falhas integer; v_janela timestamptz; v_outro boolean; v_antigo uuid;
begin
 if not public.fn_support_write_allowed(p_org) or not exists(select 1 from public.user_organizations where organization_id=p_org and user_id=p_actor and role in ('agent','manager','admin') and accepted_at is not null and revoked_at is null) then
   return jsonb_build_object('erro','permissao_negada');
 end if;
 if p_acao not in ('assumir','liberar') then return jsonb_build_object('erro','acao_invalida'); end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 -- Carteira antes de conversas: uma fila por cliente, inclusive entre canais.
 if p_contact is not null then
   select carteira_user_id into v_dono from public.contacts where id=p_contact and organization_id=p_org for update;
   if not found then return jsonb_build_object('erro','nao_encontrado'); end if;
 end if;
 if p_conversation is not null then
   select * into v_conv from public.conversations where id=p_conversation and organization_id=p_org and contact_id is not distinct from p_contact for update;
   if not found then return jsonb_build_object('erro','nao_encontrado'); end if;
   if not public.fn_can_view_conversation(p_org,v_conv.assigned_to_user_id) and not (v_conv.assigned_to_user_id is null and p_acao='assumir') then
     return jsonb_build_object('erro','nao_encontrado');
   end if;
   if p_acao='assumir' and v_conv.assigned_to_user_id is distinct from p_expected then return jsonb_build_object('erro','conflito'); end if;
 end if;
 v_antigo := v_dono;
 v_outro := (v_dono is not null and v_dono<>p_actor and public.fn_member_role_in_org(v_dono,p_org) in ('agent','manager','admin'))
   or exists(select 1 from public.conversations where organization_id=p_org and ((p_contact is not null and contact_id=p_contact and not is_group) or id=p_conversation)
      and (status not in ('closed','archived','resolved') or id=p_conversation)
      and assigned_to_user_id is not null and assigned_to_user_id<>p_actor and public.fn_member_role_in_org(assigned_to_user_id,p_org) in ('agent','manager','admin'));
 if p_acao='liberar' then
   if v_outro or (v_dono is distinct from p_actor and (p_conversation is null or v_conv.assigned_to_user_id is distinct from p_actor)) then
     return jsonb_build_object('erro','somente_responsavel');
   end if;
 elsif v_outro then
   if p_senha is null or p_senha='' then return jsonb_build_object('erro','senha_necessaria'); end if;
   insert into public.atendimento_tentativas(organization_id,user_id) values(p_org,p_actor) on conflict do nothing;
   select falhas,janela into v_falhas,v_janela from public.atendimento_tentativas where organization_id=p_org and user_id=p_actor for update;
   if v_janela<=now()-interval '15 minutes' then
     v_falhas:=0;
     update public.atendimento_tentativas set falhas=0,janela=now() where organization_id=p_org and user_id=p_actor;
   end if;
   if v_falhas>=5 then return jsonb_build_object('erro','tentativas_excedidas'); end if;
   select senha_hash into v_hash from public.atendimento_senhas where organization_id=p_org for share;
   if v_hash is null then return jsonb_build_object('erro','senha_nao_configurada'); end if;
   if octet_length(p_senha)>72 or extensions.crypt(p_senha,v_hash) is distinct from v_hash then
     update public.atendimento_tentativas set falhas=falhas+1 where organization_id=p_org and user_id=p_actor;
     return jsonb_build_object('erro','senha_incorreta');
   end if;
   update public.atendimento_tentativas set falhas=0 where organization_id=p_org and user_id=p_actor;
 end if;
 perform set_config('app.atendimento_autorizado',p_org::text || ':' || coalesce(p_contact::text,p_conversation::text),true);
 if p_contact is not null then
   update public.contacts set carteira_user_id=case when p_acao='assumir' then p_actor else null end,
     carteira_origem=case when p_acao='assumir' then 'manual' else null end,
     carteira_definida_em=case when p_acao='assumir' then now() else null end,updated_at=now()
   where id=p_contact and organization_id=p_org;
 end if;
 -- Todas as conversas existentes do cliente recebem a mesma identificação.
 for v_c in select id from public.conversations where organization_id=p_org
    and ((p_contact is not null and contact_id=p_contact and not is_group) or id=p_conversation)
    and (status not in ('closed','archived','resolved') or id=p_conversation)
    and (p_acao='assumir' or assigned_to_user_id=p_actor) order by id for update
 loop
   select * into v_result from public.fn_conversation_assign(p_org,v_c,case when p_acao='assumir' then p_actor else null end,case when p_acao='assumir' then 'claim' else 'release' end);
   if v_c=p_conversation then v_conv:=v_result; end if;
 end loop;
 if p_acao='assumir' and p_contact is not null then
   update public.crm_leads set owner_user_id=p_actor,owner_kind='user',assigned_at=now()
   where organization_id=p_org and contact_id=p_contact and status='open' and owner_user_id is null and owner_agent_id is null;
 end if;
 return jsonb_build_object('conversation',case when p_conversation is not null then to_jsonb(v_conv) else null end,'dono_user_id',case when p_acao='assumir' then p_actor else null end,'antes',v_antigo,'autorizado_por_senha',v_outro);
end;
$$;
revoke execute on function public.fn_atendimento_alterar(uuid,uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.fn_atendimento_alterar(uuid,uuid,uuid,uuid,text,text,uuid) to service_role;

create or replace function public.fn_definir_carteira_do_cliente(
  p_org uuid,
  p_actor uuid,
  p_contact uuid,
  p_dono uuid,
  p_origem text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := p_actor;
  v_papel text;
  v_dono_papel text;
  v_contato_org uuid;
  v_origem text := coalesce(p_origem, 'manual');
begin
  if v_ator is null then
    raise exception 'carteira_sem_ator' using errcode = '42501';
  end if;
  if p_org is null or p_contact is null then
    raise exception 'carteira_parametro_invalido' using errcode = '22023';
  end if;
  if v_origem not in ('manual', 'importacao', 'atribuicao_automatica') then
    raise exception 'carteira_origem_invalida' using errcode = '22023';
  end if;

  -- Quem muda: manager+ da MESMA organização (e membro aceito, não revogado).
  select uo.role into v_papel
    from public.user_organizations uo
   where uo.user_id = v_ator
     and uo.organization_id = p_org
     and uo.accepted_at is not null
     and uo.revoked_at is null;
  if v_papel is null or v_papel not in ('manager', 'admin') then
    raise exception 'carteira_permissao_negada'
      using errcode = '42501',
            detail = 'Só manager e admin definem a carteira do cliente.';
  end if;

  select c.organization_id into v_contato_org
    from public.contacts c
   where c.id = p_contact;
  if v_contato_org is null then
    raise exception 'carteira_contato_nao_encontrado' using errcode = '22023';
  end if;
  if v_contato_org <> p_org then
    raise exception 'carteira_contato_de_outra_organizacao' using errcode = '42501';
  end if;

  if p_dono is not null then
    -- Quem CONTA: membro ativo da mesma org com papel de trabalho. `viewer` e
    -- membro revogado não contam — o cliente volta ao fluxo normal.
    select uo.role into v_dono_papel
      from public.user_organizations uo
     where uo.user_id = p_dono
       and uo.organization_id = p_org
       and uo.accepted_at is not null
       and uo.revoked_at is null;
    if v_dono_papel is null or v_dono_papel not in ('agent', 'manager', 'admin') then
      raise exception 'carteira_dono_invalido'
        using errcode = '22023',
              detail = 'O dono precisa ser membro ativo da mesma organização com papel agent, manager ou admin.';
    end if;
  end if;

  perform 1 from public.contacts where id=p_contact and organization_id=p_org for update;
  if exists(select 1 from public.contacts c where c.id=p_contact and c.organization_id=p_org
      and c.carteira_user_id is not null and c.carteira_user_id is distinct from p_dono
      and public.fn_member_role_in_org(c.carteira_user_id,p_org) in ('agent','manager','admin')
      and not (c.carteira_user_id=p_actor and p_dono is null)) then
    raise exception 'atendimento_senha_necessaria' using errcode='PT403';
  end if;
  if exists(select 1 from public.conversations c where c.organization_id=p_org and c.contact_id=p_contact
      and c.status not in ('closed','archived','resolved')
      and c.assigned_to_user_id is not null and c.assigned_to_user_id is distinct from p_dono
      and public.fn_member_role_in_org(c.assigned_to_user_id,p_org) in ('agent','manager','admin')
      and not (c.assigned_to_user_id=p_actor and p_dono is null)) then
    raise exception 'atendimento_senha_necessaria' using errcode='PT403';
  end if;
  update public.contacts
     set carteira_user_id = p_dono,
         carteira_origem = case when p_dono is null then null else v_origem end,
         carteira_definida_em = case when p_dono is null then null else now() end,
         updated_at = now()
   where id = p_contact
     and organization_id = p_org;

  -- Os negócios ABERTOS sem dono do contato vão para o dono da carteira; os que
  -- já têm dono não mudam (ninguém perde carteira por causa de uma carteira).
  if p_dono is not null then
    update public.crm_leads
       set owner_user_id = p_dono,
           owner_kind = 'user',
           assigned_at = coalesce(assigned_at, now())
     where organization_id = p_org
       and contact_id = p_contact
       and status = 'open'
       and owner_user_id is null
       and owner_agent_id is null;
  end if;

  return p_dono;
end;
$$;

revoke execute on function public.fn_definir_carteira_do_cliente(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fn_definir_carteira_do_cliente(uuid, uuid, uuid, uuid, text)
  to service_role;


CREATE OR REPLACE FUNCTION public.fn_conversation_assign(p_organization_id uuid, p_conversation_id uuid, p_to_user_id uuid, p_reason text, p_expected_assignee uuid DEFAULT NULL::uuid, p_enforce_expected boolean DEFAULT false)
 RETURNS SETOF conversations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_from uuid;
  v_conv public.conversations%rowtype;
begin
  if not public.fn_support_write_allowed(p_organization_id) then raise exception 'support_readonly' using errcode='42501'; end if;
  if auth.uid() is not null
     and not public.fn_role_at_least(p_organization_id, 'agent') then
    raise exception 'caller_not_authorized_for_org'
      using hint = 'caller must be an active agent+ member of the organization';
  end if;

  if p_to_user_id is not null then
    if coalesce(public.fn_member_role_in_org(p_to_user_id, p_organization_id), 'none')
         not in ('agent','manager','admin') then
      raise exception 'assignee_not_eligible_member'
        using hint = 'target must be an active agent+ member of the organization';
    end if;
  end if;

  -- Conversa fora da visibilidade de quem chama responde como conversa
  -- inexistente (zero linhas). A regra fica no WHERE, com o dono da própria
  -- linha (reavaliado na versão nova se houver espera), nunca um valor do
  -- corpo. Service role (sem auth.uid) segue.
  --
  -- A EXCEÇÃO DA #3479: conversa SEM dono pode ser assumida por quem assume
  -- para si. Sem ela o modo "Só os seus" se morde: a conversa que nasceu do
  -- cadastro do contato tem dono nulo, o predicado do modo responde "não vejo"
  -- para dono nulo, e o claim — a operação que daria dono a ela — era recusado,
  -- com a tela dizendo "está com outro atendente" sobre uma conversa de
  -- ninguém. O termo se limita sozinho: exige dono nulo E dono novo =
  -- chamador, então conversa de colega (o caso que a 0685 protege), a
  -- transferência para terceiro e o release continuam respondendo zero linhas
  -- exatamente como antes.
  -- Mesmo bloqueio do cliente antes da conversa em todos os RPCs antigos.
  perform 1 from public.contacts c where c.organization_id=p_organization_id
    and c.id=(select contact_id from public.conversations where id=p_conversation_id and organization_id=p_organization_id)
    for update;
  select assigned_to_user_id into v_from
    from public.conversations
   where id = p_conversation_id
     and organization_id = p_organization_id
     and (
       auth.uid() is null
       or public.fn_can_view_conversation(organization_id, assigned_to_user_id)
       or (assigned_to_user_id is null and p_to_user_id = auth.uid()
           and p_reason = 'claim' and p_enforce_expected)
     )
   for no key update;

  if not found then
    return;
  end if;

  if p_enforce_expected and v_from is distinct from p_expected_assignee then
    return;
  end if;

  update public.conversations
     set assigned_to_user_id = p_to_user_id,
         -- Desnormalizado JUNTO com o dono, na mesma transação: nunca existe
         -- uma janela em que id e nome discordam. NULL junto com o id quando
         -- a atribuição é removida (release) — nunca sobra um nome órfão de
         -- dono nenhum. Lido de auth.users porque quem chama esta função
         -- (RPC) não necessariamente tem acesso ao Admin API — a definer
         -- resolve por dentro.
         assigned_to_user_name = case
           when p_to_user_id is null then null
           else (select raw_user_meta_data ->> 'full_name' from auth.users where id = p_to_user_id)
         end,
         assigned_at = case when p_to_user_id is null then null else now() end,
         assignee_kind = case when p_to_user_id is null then null else 'user' end,
         status = case when p_to_user_id is null then (case when status in ('closed','archived','resolved') then status else 'open' end) else 'claimed' end,
         status_changed_at = now(),
         unread_count_for_assignee = 0,
         bot_silenced_until = case
           when p_reason = 'routing'  then bot_silenced_until
           when p_to_user_id is null  then (case when last_handoff_at is null
                                                 then null
                                                 else bot_silenced_until end)
           else 'infinity'::timestamptz
         end,
         updated_at = now()
   where id = p_conversation_id
   returning * into v_conv;

  insert into public.conversation_assignment_events
    (organization_id, conversation_id, from_user_id, to_user_id, changed_by, reason)
  values
    (p_organization_id, p_conversation_id, v_from, p_to_user_id, auth.uid(), p_reason);

  return next v_conv;
end;
$function$;

revoke execute on function public.fn_conversation_assign(uuid,uuid,uuid,text,uuid,boolean) from public,anon;
grant execute on function public.fn_conversation_assign(uuid,uuid,uuid,text,uuid,boolean) to authenticated,service_role;
