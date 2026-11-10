-- manifest: Agendamento de postagens: o Deskcomm passa a segurar a publicação e entregá-la ao provedor só quando as regras de segurança permitem. Cria `social_seguranca` (limite diário, intervalo, lote e pausa por organização) e acrescenta a `social_publicacoes` o estado `publicando`, `publicada_em`, `tentativas` e `aguardando_motivo`. Aditiva e idempotente.
create table if not exists public.social_seguranca (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  limite_diario integer not null default 20,
  intervalo_min_s integer not null default 30,
  intervalo_max_s integer not null default 120,
  lote integer not null default 5,
  pausa_lote_s integer not null default 300,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_seguranca_limite check (limite_diario between 1 and 100),
  constraint social_seguranca_intervalo check (intervalo_min_s between 10 and 3600 and intervalo_max_s between intervalo_min_s and 3600),
  constraint social_seguranca_lote check (lote between 1 and 50),
  constraint social_seguranca_pausa check (pausa_lote_s between 30 and 7200 and pausa_lote_s >= intervalo_max_s)
);

alter table public.social_seguranca enable row level security;

drop policy if exists social_seguranca_select on public.social_seguranca;
create policy social_seguranca_select on public.social_seguranca
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or (select public.fn_is_platform_admin())
  );

revoke all on public.social_seguranca from anon;
revoke all on public.social_seguranca from authenticated;
grant select on public.social_seguranca to authenticated;
grant all on public.social_seguranca to service_role;

drop trigger if exists trg_social_seguranca_updated_at on public.social_seguranca;
create trigger trg_social_seguranca_updated_at
  before update on public.social_seguranca
  for each row execute function public.fn_set_updated_at();

alter table public.social_publicacoes add column if not exists publicada_em timestamptz;
alter table public.social_publicacoes add column if not exists tentativas integer not null default 0;
alter table public.social_publicacoes add column if not exists aguardando_motivo text;

alter table public.social_publicacoes drop constraint if exists social_publicacoes_status;
alter table public.social_publicacoes add constraint social_publicacoes_status
  check (status in ('agendada', 'publicando', 'publicada', 'falhou', 'cancelada'));

-- O cron lê "o que está vencido e ainda não saiu", por organização.
create index if not exists social_publicacoes_fila_idx
  on public.social_publicacoes (organization_id, agendada_para)
  where status in ('agendada', 'publicando');
