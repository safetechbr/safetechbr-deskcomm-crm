-- manifest: Excluir negociação do PDV com motivo: status 'excluida' (a linha fica, some do histórico), colunas excluida_em/excluida_por/motivo_exclusao e fn_excluir_negociacao_de_veiculo (gerente+). Numa negociação concluída desfaz tudo: o carro vendido volta a 'disponivel', o carro da troca (ou o comprado) sai do estoque, parcelas pendentes caem e lançamentos pagos ganham contra-lançamento. Aditiva e idempotente.

alter table public.negociacoes_de_veiculo drop constraint if exists negociacoes_de_veiculo_status;
alter table public.negociacoes_de_veiculo add constraint negociacoes_de_veiculo_status
  check (status in ('rascunho', 'concluida', 'cancelada', 'excluida'));

alter table public.negociacoes_de_veiculo add column if not exists excluida_em timestamptz;
alter table public.negociacoes_de_veiculo add column if not exists excluida_por uuid references auth.users(id) on delete set null;
alter table public.negociacoes_de_veiculo add column if not exists motivo_exclusao text;

create or replace function public.fn_excluir_negociacao_de_veiculo(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.negociacoes_de_veiculo%rowtype;
  e public.financial_entries%rowtype;
  v_status text;
  v_remover uuid;
  v_removidos jsonb := '[]'::jsonb;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if char_length(v_motivo) < 3 then
    raise exception 'motivo_obrigatorio' using errcode = 'PT422';
  end if;

  select * into n from public.negociacoes_de_veiculo where id = p_id for update;
  if not found then
    raise exception 'negociacao_nao_encontrada' using errcode = 'P0002';
  end if;
  if not ((select public.fn_is_platform_admin_full())
          or (n.organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(n.organization_id, 'manager'))) then
    raise exception 'negociacao_forbidden' using errcode = '42501';
  end if;
  if n.status = 'excluida' then
    raise exception 'negociacao_ja_excluida' using errcode = 'PT409';
  end if;

  if n.status = 'concluida' then
    -- O carro que a conclusão pôs no estoque: a troca (venda) ou o comprado (compra).
    v_remover := case when n.tipo = 'venda' then n.troca_veiculo_id else n.veiculo_id end;
    if v_remover is not null then
      select status into v_status from public.veiculos
        where id = v_remover and organization_id = n.organization_id for update;
      if found and v_status = 'vendido' then
        -- Já foi revendido: desfazer aqui apagaria a outra venda. Exclua aquela antes.
        raise exception 'veiculo_ja_revendido' using errcode = 'PT409';
      end if;
    end if;

    -- Financeiro antes dos veículos: o contra-lançamento não aponta para carro apagado.
    delete from public.financial_entries
     where negociacao_id = n.id and organization_id = n.organization_id and status = 'pending';
    for e in
      select * from public.financial_entries f
       where f.negociacao_id = n.id and f.organization_id = n.organization_id
         and f.status = 'paid' and f.reverses_entry_id is null
         and not exists (select 1 from public.financial_entries x where x.reverses_entry_id = f.id)
    loop
      -- O pago é imutável: estorna com a direção invertida, nunca apaga.
      insert into public.financial_entries
        (organization_id, account_id, account_plan_id, direction, amount_cents, currency,
         description, status, paid_at, origin, reverses_entry_id, negociacao_id, created_by_user_id)
      values
        (e.organization_id, e.account_id, e.account_plan_id,
         case when e.direction = 'in' then 'out' else 'in' end,
         e.amount_cents, e.currency, 'Estorno da negociação #' || n.numero || ' (excluída)',
         'paid', now(), 'reversal', e.id, n.id, auth.uid());
    end loop;

    if n.tipo = 'venda' and n.veiculo_id is not null then
      update public.veiculos set status = 'disponivel', vendido_em = null
       where id = n.veiculo_id and organization_id = n.organization_id and status = 'vendido';
    end if;
    if v_remover is not null then
      with apagado as (
        delete from public.veiculos where id = v_remover and organization_id = n.organization_id
        returning id, fotos, video
      )
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'fotos', fotos, 'video', video)), '[]'::jsonb)
        into v_removidos from apagado;
    end if;
  end if;

  update public.negociacoes_de_veiculo
     set status = 'excluida', excluida_em = now(), excluida_por = auth.uid(), motivo_exclusao = v_motivo
   where id = n.id;

  return jsonb_build_object(
    'numero', n.numero,
    'tipo', n.tipo,
    'status_anterior', n.status,
    'veiculos_removidos', v_removidos
  );
end;
$$;
revoke execute on function public.fn_excluir_negociacao_de_veiculo(uuid, text) from public, anon;
grant execute on function public.fn_excluir_negociacao_de_veiculo(uuid, text) to authenticated, service_role;
