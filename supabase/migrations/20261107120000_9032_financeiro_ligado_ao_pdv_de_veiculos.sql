-- manifest: Financeiro pronto para o PDV de veículos: financial_entries ganha negociacao_id, veiculo_id, due_date, parcela_numero/parcela_total e forma_pagamento (parcela = um lançamento; despesa do veículo = lançamento com veiculo_id), origens negociacao e despesa_veiculo, índices em negociacoes_de_veiculo e unicidade de chassi/placa por organização. Aditiva e idempotente.
-- ============================================================================
-- 9032 — FINANCEIRO LIGADO AO PDV DE VEÍCULOS
--
-- DIRC: não cria tabela de parcelas nem de despesas. Uma parcela é um
-- lançamento com vencimento; uma despesa do veículo é um lançamento de saída
-- com veiculo_id. O financeiro já tem conta, plano, status e estorno.
-- ============================================================================

alter table public.financial_entries add column if not exists negociacao_id uuid references public.negociacoes_de_veiculo(id) on delete set null;
alter table public.financial_entries add column if not exists veiculo_id uuid references public.veiculos(id) on delete set null;
alter table public.financial_entries add column if not exists due_date date;
alter table public.financial_entries add column if not exists parcela_numero int;
alter table public.financial_entries add column if not exists parcela_total int;
alter table public.financial_entries add column if not exists forma_pagamento text;

alter table public.financial_entries drop constraint if exists financial_entries_origin_check;
alter table public.financial_entries add constraint financial_entries_origin_check
  check (origin = any (array['manual','sale','reversal','recurring','negociacao','despesa_veiculo']));

alter table public.financial_entries drop constraint if exists financial_entries_parcela_check;
alter table public.financial_entries add constraint financial_entries_parcela_check
  check (
    (parcela_numero is null and parcela_total is null)
    or (parcela_numero >= 1 and parcela_total >= parcela_numero)
  );

create index if not exists financial_entries_negociacao_idx
  on public.financial_entries (negociacao_id) where negociacao_id is not null;
create index if not exists financial_entries_veiculo_idx
  on public.financial_entries (veiculo_id) where veiculo_id is not null;
create index if not exists financial_entries_org_vencimento_idx
  on public.financial_entries (organization_id, status, due_date) where due_date is not null;

create index if not exists negociacoes_de_veiculo_org_status_idx
  on public.negociacoes_de_veiculo (organization_id, status);
create index if not exists negociacoes_de_veiculo_contact_idx
  on public.negociacoes_de_veiculo (contact_id) where contact_id is not null;
create index if not exists negociacoes_de_veiculo_vendedor_idx
  on public.negociacoes_de_veiculo (vendedor_user_id) where vendedor_user_id is not null;
create index if not exists negociacoes_de_veiculo_troca_idx
  on public.negociacoes_de_veiculo (troca_veiculo_id) where troca_veiculo_id is not null;

-- Unicidade de chassi e placa por organização. Só nasce se o banco não tiver
-- repetido hoje: criar o índice sobre dado duplicado falharia no update.sh.
do $$
begin
  if not exists (
    select 1 from public.veiculos where chassi is not null and chassi <> ''
     group by organization_id, upper(chassi) having count(*) > 1
  ) then
    create unique index if not exists veiculos_org_chassi_key
      on public.veiculos (organization_id, upper(chassi)) where chassi is not null and chassi <> '';
  end if;
  if not exists (
    select 1 from public.veiculos where placa is not null and placa <> ''
     group by organization_id, upper(placa) having count(*) > 1
  ) then
    create unique index if not exists veiculos_org_placa_key
      on public.veiculos (organization_id, upper(placa)) where placa is not null and placa <> '';
  end if;
end $$;

comment on column public.financial_entries.negociacao_id is 'Negociação de veículo que originou o lançamento (origin = negociacao). Uma parcela = um lançamento.';
comment on column public.financial_entries.veiculo_id is 'Veículo a que o lançamento pertence: despesa de preparo/documentação (origin = despesa_veiculo) ou recebimento da venda.';
comment on column public.financial_entries.due_date is 'Vencimento. entry_date segue sendo a competência; paid_at, a baixa.';
