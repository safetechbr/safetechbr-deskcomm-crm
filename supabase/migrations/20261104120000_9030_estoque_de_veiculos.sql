-- manifest: Estoque de veículos para loja de carros (fases 1+2): tabela `veiculos` por organização (modelo, versão, ano, km, motor/câmbio, preço, status), fotos (até 15) e vídeo opcional em buckets privados `vehicle-photos`/`vehicle-videos`. RLS: leitura para a organização, escrita de manager para cima. Aditiva e idempotente.
-- ============================================================================
-- 9030 — ESTOQUE DE VEÍCULOS
--
-- Tabela própria (e não o catálogo genérico): carro tem ano, km, motor, câmbio,
-- e a loja precisa de pelo menos 6 fotos por veículo. Molde: `catalog_products`
-- + 0390 (fotos como `text[]` de CAMINHOS de Storage, a primeira é a capa).
--
-- Vocabulários abertos (cor, combustível, câmbio, status) sem CHECK, conforme a
-- doutrina; a aplicação valida. Só limites numéricos e de cardinalidade ficam
-- no banco.
-- ============================================================================

create table if not exists public.veiculos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Código interno/placa final do dono da loja; a importação por planilha
  -- reconhece "mesmo veículo, atualize" por ele.
  codigo text not null,
  marca text,
  modelo text not null,
  versao text,
  ano_fabricacao int,
  ano_modelo int,
  km bigint,
  motor text,
  cambio text,
  combustivel text,
  cor text,
  placa_final text,
  preco_cents bigint not null default 0,
  moeda text not null default 'BRL',
  opcionais text,
  descricao text,
  status text not null default 'disponivel',
  fotos text[] not null default '{}',
  video text,
  entrada_em date not null default current_date,
  vendido_em timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint veiculos_preco_nao_negativo check (preco_cents >= 0),
  constraint veiculos_km_nao_negativo check (km is null or km >= 0),
  constraint veiculos_moeda_iso check (moeda ~ '^[A-Z]{3}$'),
  constraint veiculos_fotos_no_maximo_15 check (cardinality(fotos) <= 15)
);

create unique index if not exists veiculos_org_codigo_key
  on public.veiculos (organization_id, codigo);
create index if not exists veiculos_org_status_idx
  on public.veiculos (organization_id, status, modelo);
create index if not exists veiculos_modelo_trgm
  on public.veiculos using gin (modelo public.gin_trgm_ops);

alter table public.veiculos enable row level security;

drop policy if exists veiculos_select on public.veiculos;
create policy veiculos_select on public.veiculos
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or (select public.fn_is_platform_admin())
  );

drop policy if exists veiculos_insert on public.veiculos;
create policy veiculos_insert on public.veiculos
  for insert with check (
    (select public.fn_is_platform_admin_full())
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

drop policy if exists veiculos_write on public.veiculos;
create policy veiculos_write on public.veiculos
  for update using (
    (select public.fn_is_platform_admin_full())
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    (select public.fn_is_platform_admin_full())
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

drop policy if exists veiculos_delete on public.veiculos;
create policy veiculos_delete on public.veiculos
  for delete using (
    (select public.fn_is_platform_admin_full())
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

revoke all on public.veiculos from anon;
grant select, insert, update, delete on public.veiculos to authenticated;
grant all on public.veiculos to service_role;

drop trigger if exists trg_veiculos_updated_at on public.veiculos;
create trigger trg_veiculos_updated_at
  before update on public.veiculos
  for each row execute function public.fn_set_updated_at();

comment on table public.veiculos is
  'Estoque de veículos da loja. Fotos/vídeo: caminhos em storage (vehicle-photos / vehicle-videos), sempre <organization_id>/<id>/<uuid>.<ext>. Escrito pelas rotas de app/api/v1/veiculos.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-photos', 'vehicle-photos', false, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 16 MB: teto do vídeo no WhatsApp.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-videos', 'vehicle-videos', false, 16777216, array['video/mp4'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
