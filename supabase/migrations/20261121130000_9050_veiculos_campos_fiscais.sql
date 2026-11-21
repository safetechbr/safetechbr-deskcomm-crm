-- manifest: Campos fiscais em `veiculos` (NCM de 8 dígitos, custo de aquisição, origem da compra e vínculo com a NF-e de entrada/saída). Aditiva e idempotente.
-- ============================================================================
-- 9050 — VEÍCULOS: CAMPOS FISCAIS
--
-- NCM completo (8 dígitos) fica no veículo; o padrão por categoria (8703
-- automóvel, 8704 utilitário de carga, 8711 moto) é sugestão da aplicação.
-- origem: compra_pf | troca | consignacao | compra_pj (vocabulário aberto).
-- ============================================================================

alter table public.veiculos add column if not exists ncm text;
alter table public.veiculos add column if not exists custo_aquisicao bigint;
alter table public.veiculos add column if not exists origem text;
alter table public.veiculos add column if not exists nfe_entrada_id uuid references public.documentos_fiscais(id) on delete set null;
alter table public.veiculos add column if not exists nfe_saida_id uuid references public.documentos_fiscais(id) on delete set null;

alter table public.veiculos drop constraint if exists veiculos_ncm_8;
alter table public.veiculos add constraint veiculos_ncm_8
  check (ncm is null or ncm ~ '^[0-9]{8}$');
alter table public.veiculos drop constraint if exists veiculos_custo_aquisicao_nao_negativo;
alter table public.veiculos add constraint veiculos_custo_aquisicao_nao_negativo
  check (custo_aquisicao is null or custo_aquisicao >= 0);

create index if not exists veiculos_nfe_entrada_idx
  on public.veiculos (nfe_entrada_id) where nfe_entrada_id is not null;
create index if not exists veiculos_nfe_saida_idx
  on public.veiculos (nfe_saida_id) where nfe_saida_id is not null;

comment on column public.veiculos.custo_aquisicao is 'Custo de aquisição em centavos (valor da NF-e de entrada).';
