-- manifest: PDV ganha Recibo de Pagamento numerado por loja: cada lançamento de entrada de uma venda que vira `paid` gera um recibo (no máximo um por lançamento, número sequencial que nunca é reaproveitado; financiamento e consórcio, pagos pelo banco, ficam de fora). Vendas antigas não recebem recibo retroativo.
-- O saldo restante não é gravado: na conclusão da venda os lançamentos entram um a
-- um, então um saldo fotografado no gatilho sairia errado. Ele é calculado na hora
-- de imprimir (lib/pdv/recibo-pagamento.ts).

create table if not exists public.recibos_numeracao (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  ultimo bigint not null default 0
);

create table if not exists public.recibos_de_pagamento (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  negociacao_id uuid not null references public.negociacoes_de_veiculo(id) on delete restrict,
  lancamento_id uuid not null unique references public.financial_entries(id) on delete restrict,
  numero bigint not null,
  valor_cents bigint not null check (valor_cents > 0),
  forma_pagamento text,
  parcela_numero int,
  parcela_total int,
  recebido_em timestamptz not null,
  recebido_por_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, numero)
);

create index if not exists recibos_de_pagamento_negociacao_idx
  on public.recibos_de_pagamento (negociacao_id, numero);

alter table public.recibos_numeracao enable row level security;
alter table public.recibos_de_pagamento enable row level security;

-- Só leitura pela API; escrita só pelo gatilho abaixo (security definer).
drop policy if exists recibos_de_pagamento_select on public.recibos_de_pagamento;
create policy recibos_de_pagamento_select on public.recibos_de_pagamento
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or (select public.fn_is_platform_admin())
  );

drop policy if exists recibos_numeracao_select on public.recibos_numeracao;
create policy recibos_numeracao_select on public.recibos_numeracao
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or (select public.fn_is_platform_admin())
  );

create or replace function public.fn_pdv_emitir_recibo() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  proximo bigint;
begin
  if new.status <> 'paid' or new.direction <> 'in' or new.negociacao_id is null then
    return new;
  end if;
  -- Contra-lançamento (estorno) não é dinheiro recebido.
  if new.reverses_entry_id is not null then
    return new;
  end if;
  -- Financiamento e consórcio quem paga é o banco: entram no termo de quitação, não em recibo.
  if coalesce(new.forma_pagamento, '') in ('financiamento', 'consorcio') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'paid' then
    return new;
  end if;
  -- Já tem recibo: não queima número.
  if exists (select 1 from recibos_de_pagamento where lancamento_id = new.id) then
    return new;
  end if;

  insert into recibos_numeracao (organization_id, ultimo) values (new.organization_id, 1)
  on conflict (organization_id) do update set ultimo = recibos_numeracao.ultimo + 1
  returning ultimo into proximo;

  insert into recibos_de_pagamento (
    organization_id, negociacao_id, lancamento_id, numero, valor_cents,
    forma_pagamento, parcela_numero, parcela_total, recebido_em, recebido_por_user_id
  ) values (
    new.organization_id, new.negociacao_id, new.id, proximo, new.amount_cents,
    new.forma_pagamento, new.parcela_numero, new.parcela_total,
    coalesce(new.paid_at, now()), coalesce(auth.uid(), new.created_by_user_id)
  );
  return new;
end $$;
revoke all on function public.fn_pdv_emitir_recibo() from public, anon, authenticated;

drop trigger if exists trg_pdv_emitir_recibo on public.financial_entries;
create trigger trg_pdv_emitir_recibo
  after insert or update of status on public.financial_entries
  for each row execute function public.fn_pdv_emitir_recibo();
