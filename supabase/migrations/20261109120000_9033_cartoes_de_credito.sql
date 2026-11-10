-- manifest: Cartões de crédito no financeiro: tabela credit_cards (limite, fechamento, vencimento e conta que paga a fatura, RLS manager+), financial_entries.card_id para compra no cartão e fn_resumo_contas_e_cartoes (saldo derivado por conta e valor usado por cartão). Aditiva e idempotente.
-- ============================================================================
-- 9033 — CARTÕES DE CRÉDITO
--
-- DIRC: não cria tabela de fatura nem de compra. Uma compra no cartão é um
-- lançamento de SAÍDA PENDENTE com card_id, na conta que paga a fatura; pagar a
-- fatura é baixar o lançamento (status paid), e é aí que o dinheiro sai da conta.
-- O "usado" do cartão é a soma do que está pendente nele — derivado, nunca
-- gravado, como o saldo da conta.
-- ============================================================================

create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  last_digits text check (last_digits is null or last_digits ~ '^[0-9]{4}$'),
  credit_limit_cents bigint not null default 0 check (credit_limit_cents >= 0),
  closing_day int not null check (closing_day between 1 and 31),
  due_day int not null check (due_day between 1 and 31),
  -- Conta de onde a fatura é paga. `restrict`: apagar a conta deixaria o cartão sem destino.
  account_id uuid not null references public.financial_accounts(id) on delete restrict,
  currency text not null default 'BRL' check (char_length(currency) = 3),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists credit_cards_org_nome_key
  on public.credit_cards (organization_id, lower(name)) where is_active;
create index if not exists credit_cards_org_idx
  on public.credit_cards (organization_id, is_active);

alter table public.credit_cards enable row level security;
drop policy if exists tenant_isolation_credit_cards_all on public.credit_cards;
create policy tenant_isolation_credit_cards_all on public.credit_cards
  for all
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())
  with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager'))
  );
revoke all on public.credit_cards from anon;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'fn_touch_updated_at') then
    drop trigger if exists trg_credit_cards_touch on public.credit_cards;
    create trigger trg_credit_cards_touch before update on public.credit_cards
      for each row execute function public.fn_touch_updated_at();
  end if;
end $$;

alter table public.financial_entries
  add column if not exists card_id uuid references public.credit_cards(id) on delete restrict;
create index if not exists financial_entries_card_idx
  on public.financial_entries (card_id, status) where card_id is not null;

-- Saldo por conta (inicial + entradas pagas − saídas pagas) e usado por cartão
-- (saídas pendentes no cartão). `security invoker`: a RLS decide o que se vê.
create or replace function public.fn_resumo_contas_e_cartoes(p_org uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'contas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'balance_cents', a.opening_balance_cents + coalesce((
          select sum(case when e.direction = 'in' then e.amount_cents else -e.amount_cents end)
            from public.financial_entries e
           where e.account_id = a.id and e.status = 'paid' and e.organization_id = p_org
        ), 0)))
        from public.financial_accounts a where a.organization_id = p_org
    ), '[]'::jsonb),
    'cartoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'used_cents', coalesce((
          select sum(e.amount_cents)
            from public.financial_entries e
           where e.card_id = c.id and e.status = 'pending' and e.direction = 'out'
             and e.organization_id = p_org
        ), 0)))
        from public.credit_cards c where c.organization_id = p_org
    ), '[]'::jsonb)
  );
$$;
revoke execute on function public.fn_resumo_contas_e_cartoes(uuid) from public, anon;
grant execute on function public.fn_resumo_contas_e_cartoes(uuid) to authenticated, service_role;

comment on table public.credit_cards is
  'Cartão de crédito da empresa. Compra = lançamento de saída pendente com card_id; "usado" é derivado por soma, nunca gravado.';
