-- manifest: Categoria do veículo: coluna veiculos.categoria e tabela veiculo_categorias (categorias extras por organização, RLS manager+) para o agente listar modelos por SUV/hatch/sedã. Aditiva e idempotente.
-- ============================================================================
-- 9034 — CATEGORIA DO VEÍCULO
-- ============================================================================

create table if not exists public.veiculo_categorias (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index if not exists veiculo_categorias_org_nome_key
  on public.veiculo_categorias (organization_id, lower(btrim(nome)));

alter table public.veiculo_categorias enable row level security;
drop policy if exists tenant_isolation_veiculo_categorias_all on public.veiculo_categorias;
create policy tenant_isolation_veiculo_categorias_all on public.veiculo_categorias
  for all
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())
  with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager'))
  );
revoke all on public.veiculo_categorias from anon;
grant select, insert, update, delete on public.veiculo_categorias to authenticated;
grant all on public.veiculo_categorias to service_role;

-- Nula nos veículos antigos; a rota exige categoria em todo cadastro novo.
alter table public.veiculos add column if not exists categoria text;
create index if not exists veiculos_org_categoria_idx
  on public.veiculos (organization_id, categoria) where categoria is not null;

comment on column public.veiculos.categoria is
  'Categoria do veículo (Hatch, Sedã, SUV, Picape...): sugerida pelo modelo (lib/veiculos/categorias.ts) ou escolhida no cadastro; lista própria da loja em veiculo_categorias.';
