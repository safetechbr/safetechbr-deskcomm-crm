-- manifest: Fiscal etapa 3: fila de envio ao RENAVE (`renave_fila`), bucket privado `fiscal-arquivos` para XML/DANFE (guarda de 5 anos, sem delete pelo usuário), entrega ao comprador (`entrega_enviada_em`, opção `config_fiscal_loja.entrega_automatica` desligada por padrão), `renave_ativo` desligado por padrão e pacote mensal do contador (`fiscal_pacotes_mensais`). Leitura para a organização; escrita só pelo servidor. Aditiva e idempotente.
-- ============================================================================
-- 9054 — FISCAL ETAPA 3
--
--  * RENAVE: fila própria com retentativa (a nota autorizada enfileira; o cron
--    envia). Um item por documento fiscal.
--  * Arquivos: XML e DANFE ficam num bucket PRIVADO, só service role. O usuário
--    recebe link assinado de curta duração.
--  * Retenção: nota autorizada não pode ser apagada por 5 anos. A exceção é a
--    exclusão da própria organização (cascade), que já é decisão de plataforma.
--  * `entrega_automatica` e `renave_ativo` nascem FALSE: ligar é decisão da loja.
-- ============================================================================

alter table public.config_fiscal_loja add column if not exists entrega_automatica boolean not null default false;
alter table public.config_fiscal_loja add column if not exists renave_ativo boolean not null default false;

alter table public.documentos_fiscais add column if not exists xml_storage_path text;
alter table public.documentos_fiscais add column if not exists pdf_storage_path text;
alter table public.documentos_fiscais add column if not exists entrega_enviada_em timestamptz;

-- A config já tem grant por coluna: as novas precisam entrar nele.
grant select (entrega_automatica, renave_ativo) on public.config_fiscal_loja to authenticated;

-- ---------------------------------------------------------------------------
-- Bucket privado (sem policies em storage.objects: só service role acessa)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('fiscal-arquivos', 'fiscal-arquivos', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- ---------------------------------------------------------------------------
-- renave_fila
-- ---------------------------------------------------------------------------
create table if not exists public.renave_fila (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  documento_id uuid not null references public.documentos_fiscais(id) on delete cascade,
  operacao text not null,
  status text not null default 'pendente',
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  enviado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint renave_fila_documento_key unique (documento_id)
);
create index if not exists renave_fila_pendentes_idx
  on public.renave_fila (next_attempt_at) where status = 'pendente';
create index if not exists renave_fila_org_idx on public.renave_fila (organization_id);

-- ---------------------------------------------------------------------------
-- fiscal_pacotes_mensais
-- ---------------------------------------------------------------------------
create table if not exists public.fiscal_pacotes_mensais (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  competencia date not null,
  storage_path text not null,
  qtd_notas integer not null default 0,
  enviado_para text,
  enviado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_pacotes_mensais_mes_key unique (organization_id, competencia),
  constraint fiscal_pacotes_mensais_dia1 check (extract(day from competencia) = 1)
);

-- ---------------------------------------------------------------------------
-- RLS + grants + updated_at
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['renave_fila','fiscal_pacotes_mensais']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())',
      t || '_read', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.fn_set_updated_at()',
      'trg_' || t || '_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Retenção: nota autorizada não é apagada por 5 anos
-- ---------------------------------------------------------------------------
create or replace function public.fn_fiscal_bloqueia_delete()
returns trigger
language plpgsql
as $$
begin
  if old.autorizada_em is not null
     and old.autorizada_em > now() - interval '5 years'
     and exists (select 1 from public.organizations o where o.id = old.organization_id) then
    raise exception 'documento fiscal autorizado não pode ser apagado antes de 5 anos'
      using errcode = 'P0001';
  end if;
  return old;
end $$;

drop trigger if exists trg_documentos_fiscais_retencao on public.documentos_fiscais;
create trigger trg_documentos_fiscais_retencao
  before delete on public.documentos_fiscais
  for each row execute function public.fn_fiscal_bloqueia_delete();
