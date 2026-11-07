-- manifest: PDV da loja de carros: tabela `negociacoes_de_veiculo` (venda e compra, com cliente, veículo, troca, pagamentos e comissão), documentos do veículo (placa, chassi, Renavam) e custo de compra em `veiculos`, e `fn_concluir_negociacao_de_veiculo` que fecha a negociação e move o estoque numa transação só. RLS: leitura para a organização, escrita de agent para cima. Aditiva e idempotente.
-- ============================================================================
-- 9031 — PDV DE VEÍCULOS
--
-- Uma negociação é VENDA (a loja vende um carro do estoque, talvez recebendo
-- outro na troca) ou COMPRA (a loja compra o carro de um cliente). O cliente e
-- o veículo são guardados também como FOTOGRAFIA (jsonb) no momento da
-- negociação: o contrato impresso não pode mudar porque o cadastro mudou
-- depois. O formato dos jsonb vive num schema só, `lib/pdv/regras.ts`.
--
-- Fechar (`fn_concluir_negociacao_de_veiculo`) é uma transação: na venda, o
-- carro vira `vendido` e a troca entra no estoque; na compra, o carro entra no
-- estoque com o custo. `security definer` porque o vendedor (agent) fecha a
-- venda mas não edita o estoque à mão (`veiculos` é escrita de manager); o
-- papel é conferido dentro do corpo.
-- ============================================================================

alter table public.veiculos add column if not exists placa text;
alter table public.veiculos add column if not exists chassi text;
alter table public.veiculos add column if not exists renavam text;
alter table public.veiculos add column if not exists custo_cents bigint;
alter table public.veiculos drop constraint if exists veiculos_custo_nao_negativo;
alter table public.veiculos add constraint veiculos_custo_nao_negativo check (custo_cents is null or custo_cents >= 0);

create table if not exists public.negociacoes_de_veiculo (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  numero int not null,
  tipo text not null,
  status text not null default 'rascunho',
  contact_id uuid references public.contacts(id) on delete set null,
  cliente jsonb not null default '{}'::jsonb,
  veiculo_id uuid references public.veiculos(id) on delete set null,
  veiculo jsonb not null default '{}'::jsonb,
  -- Venda: preço negociado do carro. Compra: quanto a loja paga ao cliente.
  valor_cents bigint not null default 0,
  desconto_cents bigint not null default 0,
  troca jsonb,
  troca_veiculo_id uuid references public.veiculos(id) on delete set null,
  pagamentos jsonb not null default '[]'::jsonb,
  vendedor_user_id uuid,
  comissao_cents bigint,
  observacoes text,
  moeda text not null default 'BRL',
  concluida_em timestamptz,
  cancelada_em timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint negociacoes_de_veiculo_tipo check (tipo in ('venda', 'compra')),
  constraint negociacoes_de_veiculo_status check (status in ('rascunho', 'concluida', 'cancelada')),
  constraint negociacoes_de_veiculo_valor_nao_negativo check (valor_cents >= 0 and desconto_cents >= 0),
  constraint negociacoes_de_veiculo_comissao_nao_negativa check (comissao_cents is null or comissao_cents >= 0),
  constraint negociacoes_de_veiculo_pagamentos_lista check (jsonb_typeof(pagamentos) = 'array'),
  constraint negociacoes_de_veiculo_moeda_iso check (moeda ~ '^[A-Z]{3}$')
);

create unique index if not exists negociacoes_de_veiculo_org_numero_key
  on public.negociacoes_de_veiculo (organization_id, numero);
create index if not exists negociacoes_de_veiculo_org_criada_idx
  on public.negociacoes_de_veiculo (organization_id, created_at desc);
create index if not exists negociacoes_de_veiculo_veiculo_idx
  on public.negociacoes_de_veiculo (veiculo_id);

alter table public.negociacoes_de_veiculo enable row level security;

drop policy if exists negociacoes_de_veiculo_select on public.negociacoes_de_veiculo;
create policy negociacoes_de_veiculo_select on public.negociacoes_de_veiculo
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or (select public.fn_is_platform_admin())
  );

drop policy if exists negociacoes_de_veiculo_insert on public.negociacoes_de_veiculo;
create policy negociacoes_de_veiculo_insert on public.negociacoes_de_veiculo
  for insert with check (
    (select public.fn_is_platform_admin_full())
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

drop policy if exists negociacoes_de_veiculo_write on public.negociacoes_de_veiculo;
create policy negociacoes_de_veiculo_write on public.negociacoes_de_veiculo
  for update using (
    (select public.fn_is_platform_admin_full())
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  )
  with check (
    (select public.fn_is_platform_admin_full())
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

drop policy if exists negociacoes_de_veiculo_delete on public.negociacoes_de_veiculo;
create policy negociacoes_de_veiculo_delete on public.negociacoes_de_veiculo
  for delete using (
    (select public.fn_is_platform_admin_full())
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

revoke all on public.negociacoes_de_veiculo from anon;
grant select, insert, update, delete on public.negociacoes_de_veiculo to authenticated;
grant all on public.negociacoes_de_veiculo to service_role;

drop trigger if exists trg_negociacoes_de_veiculo_updated_at on public.negociacoes_de_veiculo;
create trigger trg_negociacoes_de_veiculo_updated_at
  before update on public.negociacoes_de_veiculo
  for each row execute function public.fn_set_updated_at();

comment on table public.negociacoes_de_veiculo is
  'PDV da loja de carros: venda (com troca opcional) ou compra de veículo. cliente/veiculo/troca/pagamentos são fotografias no formato de lib/pdv/regras.ts. Fechada por fn_concluir_negociacao_de_veiculo.';

-- Próximo código livre do estoque (o mesmo critério de `proximoCodigoDeVeiculo`).
create or replace function public.fn_proximo_codigo_de_veiculo(p_org uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when coalesce(max(codigo::int), 0) + 1 <= 9999 then lpad((coalesce(max(codigo::int), 0) + 1)::text, 4, '0')
    else 'V' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
  end
  from public.veiculos
  where organization_id = p_org and codigo ~ '^\d{1,4}$';
$$;
revoke execute on function public.fn_proximo_codigo_de_veiculo(uuid) from public, anon;
grant execute on function public.fn_proximo_codigo_de_veiculo(uuid) to service_role;

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
    if not found or v_status = 'vendido' then
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
        nullif(d->>'renavam', ''), coalesce((d->>'valor_cents')::bigint, 0), 0, 'reservado',
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
      case when coalesce((d->>'preco_venda_cents')::bigint, 0) > 0 then 'disponivel' else 'reservado' end,
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
