-- manifest: Log append-only de cada chamada ao Renave (endpoint, método, status, duração; sem payload nem dados pessoais) para auditar a integração. Aditiva e idempotente.
create table if not exists public.renave_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  documento_id uuid references public.documentos_fiscais(id) on delete set null,
  endpoint text not null,
  metodo text not null,
  status_http integer,
  duracao_ms integer,
  erro text,
  created_at timestamptz not null default now()
);
create index if not exists renave_log_org_doc_idx on public.renave_log (organization_id, documento_id, created_at desc);

alter table public.renave_log enable row level security;
drop policy if exists renave_log_read on public.renave_log;
create policy renave_log_read on public.renave_log for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());
revoke all on public.renave_log from anon, authenticated;
grant all on public.renave_log to service_role;
grant select on public.renave_log to authenticated;
