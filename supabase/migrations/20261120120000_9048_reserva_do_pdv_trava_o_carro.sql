-- manifest: Reserva do PDV de verdade: `reserva_expira_em` na negociação; enquanto a reserva (venda, rascunho, modalidade reserva, prazo no futuro) vale, o carro fica `reservado` e nenhuma outra negociação o reserva ou conclui; cancelar, excluir, trocar de carro ou de modalidade devolve o carro a `disponivel`; `fn_pdv_liberar_reservas_vencidas` solta os carros de reservas vencidas (preguiçoso, sem cron). Aditiva e idempotente.
alter table public.negociacoes_de_veiculo add column if not exists reserva_expira_em timestamptz;

create index if not exists negociacoes_reserva_ativa
  on public.negociacoes_de_veiculo(organization_id, veiculo_id, reserva_expira_em)
  where tipo = 'venda' and status = 'rascunho' and modalidade = 'reserva';

-- Prazo vencido não é evento: quem lê o estoque chama isto antes, e o carro volta.
create or replace function public.fn_pdv_liberar_reservas_vencidas(p_org uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if auth.uid() is not null and not (p_org in (select public.fn_user_org_ids())) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  update public.veiculos v set status = 'disponivel'
   where v.organization_id = p_org and v.status = 'reservado'
     and exists (select 1 from public.negociacoes_de_veiculo r
                  where r.organization_id = p_org and r.veiculo_id = v.id and r.tipo = 'venda'
                    and r.status = 'rascunho' and r.modalidade = 'reserva' and r.reserva_expira_em <= now())
     and not exists (select 1 from public.negociacoes_de_veiculo r
                  where r.organization_id = p_org and r.veiculo_id = v.id and r.tipo = 'venda'
                    and r.status = 'rascunho' and r.modalidade = 'reserva' and r.reserva_expira_em > now());
  get diagnostics n = row_count;
  return n;
end; $$;
revoke execute on function public.fn_pdv_liberar_reservas_vencidas(uuid) from public, anon;
grant execute on function public.fn_pdv_liberar_reservas_vencidas(uuid) to authenticated, service_role;

create or replace function public.fn_pdv_reserva_trava_veiculo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ativa_nova boolean;
  ativa_velha boolean := false;
  v_status text;
begin
  ativa_nova := coalesce(new.tipo = 'venda' and new.status = 'rascunho' and new.modalidade = 'reserva'
    and new.veiculo_id is not null and new.reserva_expira_em > now(), false);
  if tg_op = 'UPDATE' then
    ativa_velha := coalesce(old.tipo = 'venda' and old.status = 'rascunho' and old.modalidade = 'reserva'
      and old.veiculo_id is not null and old.reserva_expira_em > now(), false);
  end if;

  -- Concluir um carro que outra negociação tem reservado.
  if tg_op = 'UPDATE' and new.status = 'concluida' and old.status <> 'concluida'
     and new.tipo = 'venda' and new.veiculo_id is not null
     and exists (select 1 from public.negociacoes_de_veiculo r
                  where r.organization_id = new.organization_id and r.veiculo_id = new.veiculo_id and r.id <> new.id
                    and r.tipo = 'venda' and r.status = 'rascunho' and r.modalidade = 'reserva'
                    and r.reserva_expira_em > now()) then
    raise exception 'veiculo_reservado' using errcode = 'PT409';
  end if;

  -- Soltar: a reserva deixou de valer ou mudou de carro.
  if ativa_velha and (not ativa_nova or new.veiculo_id is distinct from old.veiculo_id) then
    update public.veiculos v set status = 'disponivel'
     where v.organization_id = old.organization_id and v.id = old.veiculo_id and v.status = 'reservado'
       and not exists (select 1 from public.negociacoes_de_veiculo r
                        where r.organization_id = old.organization_id and r.veiculo_id = old.veiculo_id and r.id <> new.id
                          and r.tipo = 'venda' and r.status = 'rascunho' and r.modalidade = 'reserva'
                          and r.reserva_expira_em > now());
  end if;

  -- Travar: reserva nova, ou passou a valer de novo, ou mudou de carro.
  if ativa_nova and (not ativa_velha or new.veiculo_id is distinct from old.veiculo_id) then
    perform public.fn_pdv_liberar_reservas_vencidas(new.organization_id);
    select status into v_status from public.veiculos
     where organization_id = new.organization_id and id = new.veiculo_id for update;
    if not found then
      raise exception 'Veículo não encontrado no estoque.' using errcode = 'PT409';
    end if;
    if exists (select 1 from public.negociacoes_de_veiculo r
                where r.organization_id = new.organization_id and r.veiculo_id = new.veiculo_id and r.id <> new.id
                  and r.tipo = 'venda' and r.status = 'rascunho' and r.modalidade = 'reserva'
                  and r.reserva_expira_em > now()) then
      raise exception 'Esse veículo já está reservado em outra negociação.' using errcode = 'PT409';
    end if;
    -- Renovar o prazo de uma reserva vencida desta negociação: o carro ainda está reservado por ela.
    if v_status <> 'disponivel' and not (v_status = 'reservado' and tg_op = 'UPDATE'
        and old.modalidade = 'reserva' and old.veiculo_id = new.veiculo_id) then
      raise exception 'Esse veículo não está disponível para reserva.' using errcode = 'PT409';
    end if;
    update public.veiculos set status = 'reservado'
     where organization_id = new.organization_id and id = new.veiculo_id and status <> 'reservado';
  end if;
  return new;
end; $$;
revoke execute on function public.fn_pdv_reserva_trava_veiculo() from public, anon, authenticated;
drop trigger if exists trg_pdv_reserva_trava_veiculo on public.negociacoes_de_veiculo;
create trigger trg_pdv_reserva_trava_veiculo
  after insert or update on public.negociacoes_de_veiculo
  for each row execute function public.fn_pdv_reserva_trava_veiculo();
