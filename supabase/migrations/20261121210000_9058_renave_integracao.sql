-- manifest: Integração RENAVE por integradora (Renave Fácil): credencial cifrada por organização (só os 4 últimos caracteres visíveis), situação do veículo no RENAVE, log append-only sem dados pessoais e bucket privado `renave-documentos` com expurgo LGPD. Aditiva e idempotente.

-- ---------------------------------------------------------------------------
-- renave_integracoes: uma credencial por organização e integradora.
-- A chave é cifrada (AES-256-GCM) no servidor; o navegador nunca lê a coluna cifrada.
-- ---------------------------------------------------------------------------
create table if not exists public.renave_integracoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integradora text not null default 'renave_facil' check (integradora in ('renave_facil')),
  api_key_ciphertext bytea,
  api_key_iv bytea,
  api_key_tag bytea,
  api_key_last4 text,
  cnpj text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  url_plataforma text,
  ativo boolean not null default false,
  limite_creditos_aviso integer not null default 5 check (limite_creditos_aviso >= 0),
  bloquear_venda_sem_confirmacao boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint renave_integracoes_org_integradora_key unique (organization_id, integradora)
);

-- ---------------------------------------------------------------------------
-- renave_veiculos: situação de cada veículo no RENAVE (chave: org + veículo + integradora).
-- ---------------------------------------------------------------------------
create table if not exists public.renave_veiculos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  integradora text not null default 'renave_facil' check (integradora in ('renave_facil')),
  situacao text check (situacao is null or situacao in ('S','T','C','X','V','E','I')),
  enviado_em timestamptz,
  nfe_compra_enviada_em timestamptz,
  nfe_venda_enviada_em timestamptz,
  saida_em timestamptz,
  documentos jsonb not null default '{}'::jsonb,
  ultimo_erro text,
  ultimo_polling_em timestamptz,
  proximo_polling_em timestamptz,
  em_envio_ate timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint renave_veiculos_chave_key unique (organization_id, veiculo_id, integradora)
);
create index if not exists renave_veiculos_polling_idx
  on public.renave_veiculos (proximo_polling_em) where situacao in ('S','T') or saida_em is not null;
create index if not exists renave_veiculos_org_situacao_idx
  on public.renave_veiculos (organization_id, situacao);

-- ---------------------------------------------------------------------------
-- renave_envios: log append-only. Sem payload, sem CPF, sem nome.
-- ---------------------------------------------------------------------------
create table if not exists public.renave_envios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  veiculo_id uuid references public.veiculos(id) on delete set null,
  integradora text not null default 'renave_facil',
  operacao text not null,
  endpoint text not null,
  metodo text not null,
  status_http integer,
  duracao_ms integer,
  codigo_erro text,
  created_at timestamptz not null default now()
);
create index if not exists renave_envios_org_veiculo_idx
  on public.renave_envios (organization_id, veiculo_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS, grants e updated_at
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['renave_integracoes','renave_veiculos','renave_envios']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())',
      t || '_read', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;

  grant select on public.renave_veiculos, public.renave_envios to authenticated;
  -- Credencial: só colunas seguras. Ciphertext, iv e tag nunca chegam ao navegador.
  grant select (id, organization_id, integradora, api_key_last4, cnpj, url_plataforma, ativo,
                limite_creditos_aviso, bloquear_venda_sem_confirmacao, created_at, updated_at)
    on public.renave_integracoes to authenticated;

  foreach t in array array['renave_integracoes','renave_veiculos']
  loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.fn_set_updated_at()',
      'trg_' || t || '_updated_at', t);
  end loop;
end $$;

drop view if exists public.renave_integracoes_safe;
create view public.renave_integracoes_safe
  with (security_invoker = true)
  as
  select id, organization_id, integradora, api_key_last4 as last4,
         (api_key_ciphertext is not null) as tem_chave,
         cnpj, url_plataforma, ativo, limite_creditos_aviso,
         bloquear_venda_sem_confirmacao, created_at, updated_at
  from public.renave_integracoes;
grant select on public.renave_integracoes_safe to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Bucket privado para os PDFs do RENAVE. Sem policies de Storage: acesso só pelo
-- servidor, com URL assinada de curta duração.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('renave-documentos', 'renave-documentos', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remover a linha do veículo não deixa PDF órfão: o worker de expurgo LGPD apaga o objeto.
create or replace function public.fn_fila_renave_documentos_removidos() returns trigger
language plpgsql security definer set search_path = public as $$
declare caminho text;
begin
  for caminho in
    select d ->> 'path' from jsonb_each(coalesce(old.documentos, '{}'::jsonb)) e(k, v),
      lateral jsonb_array_elements(case when jsonb_typeof(e.v -> 'arquivos') = 'array' then e.v -> 'arquivos' else '[]'::jsonb end) d
    where d ->> 'path' is not null
  loop
    insert into public.storage_redaction_queue (organization_id, bucket, object_path)
    values (old.organization_id, 'renave-documentos', caminho)
    on conflict (bucket, object_path) do update
      set status = 'pending', attempts = 0, processed_at = null, error_message = null;
  end loop;
  return old;
end;$$;
revoke all on function public.fn_fila_renave_documentos_removidos() from public, anon, authenticated;
grant execute on function public.fn_fila_renave_documentos_removidos() to service_role;
drop trigger if exists renave_documentos_removidos on public.renave_veiculos;
create trigger renave_documentos_removidos after delete on public.renave_veiculos
  for each row execute function public.fn_fila_renave_documentos_removidos();
