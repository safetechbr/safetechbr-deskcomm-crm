-- manifest: Publicações nas redes sociais: tabela `social_publicacoes` com o que foi agendado (feed, carrossel, Reels, Stories), por organização. Leitura para a organização; escrita só pelo servidor (service role), que confere papel, MFA e a org. Aditiva e idempotente.
create table if not exists public.social_publicacoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tipo text not null,
  legenda text not null default '',
  midias jsonb not null default '[]'::jsonb,
  contas jsonb not null default '[]'::jsonb,
  agendada_para timestamptz,
  fuso text not null default 'America/Sao_Paulo',
  status text not null default 'agendada',
  provedor_post_id text,
  erro text,
  criada_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_publicacoes_tipo check (tipo in ('feed', 'carrossel', 'reel', 'story')),
  constraint social_publicacoes_status check (status in ('agendada', 'publicada', 'falhou', 'cancelada')),
  constraint social_publicacoes_midias_lista check (jsonb_typeof(midias) = 'array'),
  constraint social_publicacoes_contas_lista check (jsonb_typeof(contas) = 'array')
);

create index if not exists social_publicacoes_org_data_idx
  on public.social_publicacoes (organization_id, agendada_para desc);

alter table public.social_publicacoes enable row level security;

drop policy if exists social_publicacoes_select on public.social_publicacoes;
create policy social_publicacoes_select on public.social_publicacoes
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or (select public.fn_is_platform_admin())
  );

revoke all on public.social_publicacoes from anon;
revoke all on public.social_publicacoes from authenticated;
grant select on public.social_publicacoes to authenticated;
grant all on public.social_publicacoes to service_role;

drop trigger if exists trg_social_publicacoes_updated_at on public.social_publicacoes;
create trigger trg_social_publicacoes_updated_at
  before update on public.social_publicacoes
  for each row execute function public.fn_set_updated_at();
