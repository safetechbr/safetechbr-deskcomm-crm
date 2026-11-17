-- manifest: Oficina de veículos: todo veículo comprado ou recebido em troca entra `em_oficina` (fora do Estoque e da venda) até ser liberado; tabela interna `veiculo_reparos` (itens da OS com custo em centavos, RLS manager+), `fn_salvar_os_do_veiculo` e `fn_concluir_negociacao_de_veiculo` redefinida para o novo status. Aditiva e idempotente.
-- ============================================================================
-- 9043 — OFICINA DE VEÍCULOS
--
-- Todo carro que entra (compra direta ou troca) nasce `em_oficina`: não aparece
-- no Estoque nem pode ser vendido até ser liberado. Na oficina registram-se os
-- reparos (ordem de serviço) com custo em centavos. O custo de compra segue em
-- `veiculos.custo_cents` (9031); o custo total = compra + soma dos reparos.
-- Tudo isto é INTERNO: `veiculo_reparos` só é legível por manager+, e nenhum
-- contrato/comprovante lê estas tabelas.
-- ============================================================================

create table if not exists public.veiculo_reparos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  descricao text not null,
  valor_cents bigint not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint veiculo_reparos_valor_nao_negativo check (valor_cents >= 0),
  constraint veiculo_reparos_descricao_curta check (char_length(descricao) between 1 and 200)
);
create index if not exists veiculo_reparos_veiculo_idx on public.veiculo_reparos (veiculo_id);
create index if not exists veiculo_reparos_org_idx on public.veiculo_reparos (organization_id);

alter table public.veiculo_reparos enable row level security;

drop policy if exists veiculo_reparos_select on public.veiculo_reparos;
create policy veiculo_reparos_select on public.veiculo_reparos
  for select using (
    (select public.fn_is_platform_admin())
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

drop policy if exists veiculo_reparos_write on public.veiculo_reparos;
create policy veiculo_reparos_write on public.veiculo_reparos
  for all using (
    (select public.fn_is_platform_admin_full())
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    (select public.fn_is_platform_admin_full())
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

revoke all on public.veiculo_reparos from anon;
grant select, insert, update, delete on public.veiculo_reparos to authenticated;
grant all on public.veiculo_reparos to service_role;

comment on table public.veiculo_reparos is
  'Itens da ordem de serviço da oficina (descrição + custo em centavos). INTERNO: nunca vai ao cliente nem a contrato/comprovante.';

-- Substitui os itens da OS do veículo numa transação só (security invoker: a RLS
-- de manager+ vale). `p_itens` = [{descricao, valor_cents}].
create or replace function public.fn_salvar_os_do_veiculo(p_veiculo uuid, p_itens jsonb)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.veiculos where id = p_veiculo for update;
  if not found then
    raise exception 'veiculo_nao_encontrado' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_itens) <> 'array' then
    raise exception 'itens_invalidos' using errcode = '22023';
  end if;
  delete from public.veiculo_reparos where veiculo_id = p_veiculo;
  insert into public.veiculo_reparos (organization_id, veiculo_id, descricao, valor_cents, created_by)
  select v_org, p_veiculo, left(btrim(i->>'descricao'), 200), coalesce((i->>'valor_cents')::bigint, 0), auth.uid()
  from jsonb_array_elements(p_itens) i
  where btrim(coalesce(i->>'descricao', '')) <> '';
end;
$$;
revoke execute on function public.fn_salvar_os_do_veiculo(uuid, jsonb) from public, anon;
grant execute on function public.fn_salvar_os_do_veiculo(uuid, jsonb) to authenticated, service_role;

create or replace function public.fn_concluir_negociacao_de_veiculo(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n public.negociacoes_de_veiculo%rowtype;
  v_status text;
  v_novo uuid;
  v_troca uuid;
  d jsonb;
begin
  select * into n from public.negociacoes_de_veiculo where id = p_id for update;
  if not found then
    raise exception 'negociacao_nao_encontrada' using errcode = 'P0002';
  end if;
  if not ((select public.fn_is_platform_admin_full())
          or (n.organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(n.organization_id, 'agent'))) then
    raise exception 'negociacao_forbidden' using errcode = '42501';
  end if;
  if n.status <> 'rascunho' then
    raise exception 'negociacao_ja_fechada' using errcode = 'PT409';
  end if;

  if n.tipo = 'venda' then
    if n.veiculo_id is null then
      raise exception 'veiculo_obrigatorio' using errcode = 'PT422';
    end if;
    select status into v_status from public.veiculos
      where id = n.veiculo_id and organization_id = n.organization_id for update;
    if not found or v_status in ('vendido', 'em_oficina') then
      raise exception 'veiculo_indisponivel' using errcode = 'PT409';
    end if;
    update public.veiculos set status = 'vendido', vendido_em = now()
      where id = n.veiculo_id and organization_id = n.organization_id;

    -- A troca entra no estoque com o valor avaliado como custo.
    if n.troca is not null and coalesce((n.troca->>'entra_no_estoque')::boolean, true) then
      d := n.troca;
      insert into public.veiculos (
        organization_id, codigo, marca, modelo, versao, ano_fabricacao, ano_modelo, km, cor,
        combustivel, cambio, placa, chassi, renavam, custo_cents, preco_cents, status, descricao, created_by
      ) values (
        n.organization_id, public.fn_proximo_codigo_de_veiculo(n.organization_id),
        nullif(d->>'marca', ''), coalesce(nullif(d->>'modelo', ''), 'Veículo da troca'), nullif(d->>'versao', ''),
        (d->>'ano_fabricacao')::int, (d->>'ano_modelo')::int, (d->>'km')::bigint, nullif(d->>'cor', ''),
        nullif(d->>'combustivel', ''), nullif(d->>'cambio', ''), nullif(d->>'placa', ''), nullif(d->>'chassi', ''),
        nullif(d->>'renavam', ''), coalesce((d->>'valor_cents')::bigint, 0), 0, 'em_oficina',
        'Entrou na troca da negociação #' || n.numero, auth.uid()
      ) returning id into v_troca;
    end if;
  else
    d := n.veiculo;
    insert into public.veiculos (
      organization_id, codigo, marca, modelo, versao, ano_fabricacao, ano_modelo, km, cor, combustivel,
      cambio, motor, placa, chassi, renavam, custo_cents, preco_cents, status, descricao, created_by
    ) values (
      n.organization_id, public.fn_proximo_codigo_de_veiculo(n.organization_id),
      nullif(d->>'marca', ''), coalesce(nullif(d->>'modelo', ''), 'Veículo comprado'), nullif(d->>'versao', ''),
      (d->>'ano_fabricacao')::int, (d->>'ano_modelo')::int, (d->>'km')::bigint, nullif(d->>'cor', ''),
      nullif(d->>'combustivel', ''), nullif(d->>'cambio', ''), nullif(d->>'motor', ''), nullif(d->>'placa', ''),
      nullif(d->>'chassi', ''), nullif(d->>'renavam', ''), n.valor_cents,
      coalesce((d->>'preco_venda_cents')::bigint, 0),
      'em_oficina',
      'Comprado na negociação #' || n.numero, auth.uid()
    ) returning id into v_novo;
  end if;

  update public.negociacoes_de_veiculo
     set status = 'concluida', concluida_em = now(),
         veiculo_id = coalesce(v_novo, veiculo_id),
         troca_veiculo_id = coalesce(v_troca, troca_veiculo_id)
   where id = n.id;

  return jsonb_build_object('veiculo_id', coalesce(v_novo, n.veiculo_id), 'troca_veiculo_id', v_troca);
end;
$$;
revoke execute on function public.fn_concluir_negociacao_de_veiculo(uuid) from public, anon;
grant execute on function public.fn_concluir_negociacao_de_veiculo(uuid) to authenticated, service_role;
