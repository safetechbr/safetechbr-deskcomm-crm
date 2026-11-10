-- manifest: Reserva de visita por vendedor por até 24h, com histórico, aquisição atômica, expiração por prazo e proteção de envio/venda na organização.
create table if not exists public.reservas_de_veiculo (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  vendedor_user_id uuid not null references auth.users(id),
  conversation_id uuid references public.conversations(id) on delete set null,
  criada_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '24 hours'),
  visita_em timestamptz,
  encerrada_em timestamptz,
  motivo_encerramento text,
  constraint reservas_veiculo_prazo check (expira_em > criada_em and expira_em <= criada_em + interval '24 hours')
);
create unique index if not exists reservas_veiculo_aberta on public.reservas_de_veiculo(veiculo_id) where encerrada_em is null;
create index if not exists reservas_veiculo_org_prazo on public.reservas_de_veiculo(organization_id,expira_em) where encerrada_em is null;
alter table public.reservas_de_veiculo enable row level security;
drop policy if exists tenant_isolation_reservas_de_veiculo_all on public.reservas_de_veiculo;
create policy tenant_isolation_reservas_de_veiculo_all on public.reservas_de_veiculo for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()) or (select public.fn_is_platform_admin()));
-- Escrita só pela função: um vendedor não recebe UPDATE de preço/status.
revoke all on public.reservas_de_veiculo from public, anon, authenticated;
grant select on public.reservas_de_veiculo to authenticated;
grant all on public.reservas_de_veiculo to service_role;

create or replace function public.fn_reservar_veiculo(
  p_org uuid, p_veiculo uuid, p_conversa uuid, p_horas integer default 24, p_visita timestamptz default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.veiculos%rowtype; r public.reservas_de_veiculo%rowtype;
begin
  if auth.uid() is null or not (p_org in (select public.fn_user_org_ids()) and public.fn_role_at_least(p_org,'agent')) then
    raise exception 'Sem permissão para reservar.' using errcode='42501';
  end if;
  if p_horas is null or p_horas < 1 or p_horas > 24 then
    raise exception 'A reserva deve durar de 1 a 24 horas.' using errcode='PT422';
  end if;
  select * into v from public.veiculos where id=p_veiculo and organization_id=p_org for update;
  if not found then raise exception 'Veículo não encontrado.' using errcode='P0002'; end if;
  if v.status <> 'disponivel' then raise exception 'Veículo indisponível.' using errcode='PT409'; end if;
  if not exists(select 1 from public.conversations where id=p_conversa and organization_id=p_org and not is_group) then
    raise exception 'Conversa não encontrada.' using errcode='P0002';
  end if;
  if p_visita is not null and (p_visita < now() or p_visita > now()+make_interval(hours=>p_horas)) then
    raise exception 'A visita deve ocorrer dentro do prazo da reserva.' using errcode='PT422';
  end if;
  select * into r from public.reservas_de_veiculo where veiculo_id=p_veiculo and encerrada_em is null for update;
  if found and r.expira_em > now() then
    if r.vendedor_user_id = auth.uid() then return to_jsonb(r); end if;
    raise exception 'Este veículo já está reservado por outro vendedor.' using errcode='PT409';
  end if;
  update public.reservas_de_veiculo set encerrada_em=expira_em,motivo_encerramento='expirada'
    where veiculo_id=p_veiculo and organization_id=p_org and encerrada_em is null;
  insert into public.reservas_de_veiculo(organization_id,veiculo_id,vendedor_user_id,conversation_id,expira_em,visita_em)
    values(p_org,p_veiculo,auth.uid(),p_conversa,now()+make_interval(hours=>p_horas),p_visita) returning * into r;
  return to_jsonb(r);
end; $$;
revoke execute on function public.fn_reservar_veiculo(uuid,uuid,uuid,integer,timestamptz) from public,anon;
grant execute on function public.fn_reservar_veiculo(uuid,uuid,uuid,integer,timestamptz) to authenticated;

create or replace function public.fn_liberar_reserva_veiculo(p_org uuid,p_veiculo uuid,p_reserva uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.reservas_de_veiculo%rowtype;
begin
  if auth.uid() is null or not (p_org in (select public.fn_user_org_ids()) and public.fn_role_at_least(p_org,'agent')) then
    raise exception 'Sem permissão para liberar.' using errcode='42501';
  end if;
  perform 1 from public.veiculos where id=p_veiculo and organization_id=p_org for update;
  select * into r from public.reservas_de_veiculo where id=p_reserva and veiculo_id=p_veiculo and organization_id=p_org for update;
  if not found then raise exception 'Reserva não encontrada.' using errcode='P0002'; end if;
  if r.vendedor_user_id <> auth.uid() and not public.fn_role_at_least(p_org,'manager') then
    raise exception 'Somente o responsável ou gerente pode liberar.' using errcode='42501';
  end if;
  if r.encerrada_em is not null or r.expira_em <= now() then return false; end if;
  update public.reservas_de_veiculo set encerrada_em=now(),motivo_encerramento='liberada' where id=r.id and organization_id=p_org;
  return true;
end; $$;
revoke execute on function public.fn_liberar_reserva_veiculo(uuid,uuid,uuid) from public,anon;
grant execute on function public.fn_liberar_reserva_veiculo(uuid,uuid,uuid) to authenticated;

-- Toda conclusão do PDV já bloqueia a linha de veiculos; a mesma linha serializa a reserva.
create or replace function public.fn_reserva_veiculo_ao_mudar_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.reservas_de_veiculo%rowtype;
begin
  if new.status is distinct from old.status and new.status <> 'disponivel' then
    select * into r from public.reservas_de_veiculo where organization_id=old.organization_id and veiculo_id=old.id
      and encerrada_em is null and expira_em>now() for update;
    if found and r.vendedor_user_id is distinct from auth.uid() then
      raise exception 'Libere a reserva do outro vendedor antes de alterar a disponibilidade.' using errcode='PT409';
    end if;
    update public.reservas_de_veiculo set encerrada_em=now(),motivo_encerramento=case when new.status='vendido' then 'vendida' else 'indisponivel' end
      where organization_id=old.organization_id and veiculo_id=old.id and encerrada_em is null and expira_em>now();
  end if;
  return new;
end; $$;
revoke execute on function public.fn_reserva_veiculo_ao_mudar_status() from public,anon,authenticated;
drop trigger if exists trg_reserva_veiculo_status on public.veiculos;
create trigger trg_reserva_veiculo_status before update of status on public.veiculos for each row execute function public.fn_reserva_veiculo_ao_mudar_status();

-- Defesa na persistência: mesmo mídia preparada ANTES da reserva não pode sair por outro vendedor.
create or replace function public.fn_mensagem_confere_reserva_veiculo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare vid uuid; v_status text; dono uuid;
begin
  if new.direction <> 'outbound' then return new; end if;
  if new.metadata->>'veiculo_id' is not null then
    begin vid := (new.metadata->>'veiculo_id')::uuid;
    exception when invalid_text_representation then raise exception 'Veículo inválido.' using errcode='PT422'; end;
  elsif new.media_storage_path like '%/veiculo-%' then
    select v.id into vid from public.veiculos v where v.organization_id=new.organization_id
      and (exists(select 1 from unnest(v.fotos) f where split_part(new.media_storage_path,'/veiculo-',2)=split_part(f,'/',3))
        or split_part(new.media_storage_path,'/veiculo-',2)=split_part(v.video,'/',3)) limit 1;
  end if;
  if vid is null then return new; end if;
  select status into v_status from public.veiculos where id=vid and organization_id=new.organization_id for share;
  if not found or v_status <> 'disponivel' then raise exception 'Veículo indisponível.' using errcode='PT409'; end if;
  select vendedor_user_id into dono from public.reservas_de_veiculo where veiculo_id=vid and organization_id=new.organization_id
    and encerrada_em is null and expira_em>now();
  if found and dono is distinct from coalesce(auth.uid(),new.sent_by_user_id) then
    raise exception 'Este veículo está reservado por outro vendedor.' using errcode='PT409';
  end if;
  return new;
end; $$;
revoke execute on function public.fn_mensagem_confere_reserva_veiculo() from public,anon,authenticated;
drop trigger if exists trg_mensagem_confere_reserva_veiculo on public.messages;
create trigger trg_mensagem_confere_reserva_veiculo before insert on public.messages for each row execute function public.fn_mensagem_confere_reserva_veiculo();

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='reservas_de_veiculo') then
    alter publication supabase_realtime add table public.reservas_de_veiculo;
  end if;
end $$;
