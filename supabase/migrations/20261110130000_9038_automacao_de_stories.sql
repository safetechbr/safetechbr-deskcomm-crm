-- manifest: Automação de Stories: cria `social_story_janelas` (janelas de horário com grade de slots por organização) e acrescenta `serie_id` a `social_publicacoes` para agrupar Stories repetidos. Aditiva e idempotente.
create table if not exists public.social_story_janelas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null,
  inicio text not null,
  fim text not null,
  intervalo_min integer not null default 3,
  dias_semana integer[] not null default '{0,1,2,3,4,5,6}',
  ativa boolean not null default true,
  posicao integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_story_janelas_nome check (char_length(nome) between 1 and 60),
  constraint social_story_janelas_hora check (inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and fim ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and fim > inicio),
  constraint social_story_janelas_intervalo check (intervalo_min between 1 and 240)
);

create index if not exists social_story_janelas_org_idx
  on public.social_story_janelas (organization_id, posicao);

alter table public.social_story_janelas enable row level security;

drop policy if exists social_story_janelas_select on public.social_story_janelas;
create policy social_story_janelas_select on public.social_story_janelas
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or (select public.fn_is_platform_admin())
  );

revoke all on public.social_story_janelas from anon;
revoke all on public.social_story_janelas from authenticated;
grant select on public.social_story_janelas to authenticated;
grant all on public.social_story_janelas to service_role;

drop trigger if exists trg_social_story_janelas_updated_at on public.social_story_janelas;
create trigger trg_social_story_janelas_updated_at
  before update on public.social_story_janelas
  for each row execute function public.fn_set_updated_at();

-- Série: Stories criados juntos pela repetição (dias da semana ou datas escolhidas).
alter table public.social_publicacoes add column if not exists serie_id uuid;
create index if not exists social_publicacoes_serie_idx
  on public.social_publicacoes (organization_id, serie_id)
  where serie_id is not null;
