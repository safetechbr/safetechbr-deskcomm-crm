-- manifest: Trava do logo das empresas: platform_branding.logo_bloqueado (padrão true). Com a trava ligada as empresas não trocam o logo; só o admin mestre desliga. Aditiva e idempotente.
-- ============================================================================
-- 9035 — TRAVA DO LOGO DAS EMPRESAS
--
-- O revendedor quer que todas as empresas vejam o logo DELE. A trava vive na
-- linha única da marca da instalação e nasce LIGADA: instalação nova ou antiga
-- começa sem permitir a troca, e só o admin mestre desliga (/admin/marca).
-- ============================================================================

alter table public.platform_branding
  add column if not exists logo_bloqueado boolean not null default true;

comment on column public.platform_branding.logo_bloqueado is
  'true = as empresas (organizações) não podem trocar o logo; todas mostram o logo da instalação. Só o admin mestre desliga. Lida por lib/branding/logo-bloqueado.ts.';
