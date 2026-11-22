-- manifest: Token de revenda da Focus NFe da instalação (platform_fiscal_focus): singleton cifrado, só service_role, gravado pela tela /admin/fiscal; o FOCUS_TOKEN_REVENDA do .env continua como piso de rollback. Aditiva e idempotente.

-- 9059 · Token de revenda da Focus NFe, gravado pela tela /admin/fiscal.
--
-- O token é da INSTALAÇÃO (quem revende a Focus cadastra as empresas de todas as
-- lojas com ele), não de uma organização. Antes só existia como
-- `FOCUS_TOKEN_REVENDA` no `.env`; o `.env` continua valendo como piso de
-- rollback (o banco tem precedência).
--
-- Mesmo desenho de `platform_meta_app` (0257): singleton, RLS ligada sem
-- policies, grants de anon/authenticated revogados — só o service_role alcança —
-- e cifra por `fn_encrypt_oauth`, sem função nova.

create table if not exists public.platform_fiscal_focus (
  id smallint primary key default 1,
  token_revenda_encrypted bytea,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint platform_fiscal_focus_singleton check (id = 1)
);

comment on table public.platform_fiscal_focus is
  'Token de revenda da Focus NFe desta INSTALAÇÃO (singleton). Server-side only: RLS ligada sem policies e grants revogados de anon/authenticated. O token nunca volta ao browser.';
comment on column public.platform_fiscal_focus.token_revenda_encrypted is
  'Cifrado por fn_encrypt_oauth. Nunca em claro: sem a chave mestra o save recusa.';

alter table public.platform_fiscal_focus enable row level security;

revoke all on public.platform_fiscal_focus from anon, authenticated;
grant select, insert, update on public.platform_fiscal_focus to service_role;

drop trigger if exists trg_platform_fiscal_focus_updated_at on public.platform_fiscal_focus;
create trigger trg_platform_fiscal_focus_updated_at
  before update on public.platform_fiscal_focus
  for each row execute function public.fn_set_updated_at();
