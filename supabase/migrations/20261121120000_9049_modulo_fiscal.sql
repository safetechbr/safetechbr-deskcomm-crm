-- manifest: Módulo fiscal (NF-e 55) da loja de carros: `config_fiscal_loja` (dados do emitente, ambiente, série, token do provedor cifrado), `regras_fiscais` (CFOP/CST/alíquotas/IBS-CBS por operação, editáveis), `documentos_fiscais` (notas, sempre nascem rascunho) e `documento_fiscal_eventos` (cancelamento, CC-e, inutilização). Leitura para a organização; escrita só pelo servidor (service role). Certificado A1 e senha nunca são gravados. Aditiva e idempotente.
-- ============================================================================
-- 9049 — MÓDULO FISCAL
--
-- Decisões:
--  * Sem SEFAZ direto: provedor externo (Focus NFe) atrás de `FiscalProvider`.
--  * O .pfx e a senha NUNCA vão ao banco: passam pela memória da requisição até
--    o provedor. Guardamos só o token do provedor (AES-256-GCM) e a validade.
--  * Escrita só via service role: as rotas validam papel e filtram por
--    organization_id vindo da sessão. O token cifrado não é legível pelo
--    `authenticated` (privilégio por coluna).
--  * Vocabulários abertos sem CHECK (ambiente, status, operação...); a
--    aplicação valida. Só limites numéricos ficam no banco.
--  * IBS/CBS (cst_ibscbs, cclasstrib) já existem e podem ficar vazios: Simples
--    passa a precisar deles a partir de jan/2027.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- config_fiscal_loja
-- ---------------------------------------------------------------------------
create table if not exists public.config_fiscal_loja (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  cnpj text,
  razao_social text,
  nome_fantasia text,
  inscricao_estadual text,
  inscricao_municipal text,
  -- 1=Simples, 2=Simples excesso de sublimite, 3=Normal, 4=MEI
  crt int,
  cnae text,
  -- Endereço do emitente (obrigatório na NF-e e no cadastro no provedor).
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  municipio text,
  uf text not null default 'PI',
  cep text,
  telefone text,

  ambiente text not null default 'homologacao',
  serie_nfe int not null default 1,
  proximo_numero_nfe bigint not null default 1,

  provider text not null default 'focus',
  provider_empresa_id text,
  -- AES-256-GCM (lib/crypto/aes_gcm.ts): texto cifrado, iv e tag.
  provider_token_cifrado bytea,
  provider_token_iv bytea,
  provider_token_tag bytea,
  -- Segredo do webhook (aleatório, por loja) para validar o chamador.
  webhook_segredo text,

  certificado_validade date,
  certificado_enviado_em timestamptz,
  email_contador text,
  credenciado_sefaz boolean not null default false,
  regras_revisadas_em timestamptz,
  nota_teste_ok_em timestamptz,
  ativo boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint config_fiscal_serie_valida check (serie_nfe between 0 and 999),
  constraint config_fiscal_numero_valido check (proximo_numero_nfe >= 1),
  constraint config_fiscal_crt_valido check (crt is null or crt between 1 and 4),
  constraint config_fiscal_cnpj_14 check (cnpj is null or cnpj ~ '^[0-9]{14}$')
);

create unique index if not exists config_fiscal_loja_org_cnpj_key
  on public.config_fiscal_loja (organization_id, cnpj)
  where cnpj is not null;
create index if not exists config_fiscal_loja_org_idx
  on public.config_fiscal_loja (organization_id);

-- ---------------------------------------------------------------------------
-- regras_fiscais
-- ---------------------------------------------------------------------------
create table if not exists public.regras_fiscais (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- ENT_COMPRA_PF | ENT_TROCA | SAI_VENDA | ...
  operacao text not null,
  -- interna | interestadual
  destino text not null default 'interna',
  -- PF | PJ_contrib | PJ_nao_contrib
  tipo_pessoa text not null default 'PF',
  presencial boolean not null default true,

  cfop text not null,
  natureza_operacao text not null,
  -- CSOSN (Simples) ou CST (Normal), conforme o CRT da loja.
  csosn_ou_cst text,
  aliq_icms numeric(7,4),
  reducao_bc_pct numeric(7,4),
  cst_ibscbs text,
  cclasstrib text,
  texto_inf_adic text,

  validado_contador boolean not null default false,
  ativo boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint regras_fiscais_cfop_4 check (cfop ~ '^[0-9]{4}$'),
  constraint regras_fiscais_aliq_faixa check (aliq_icms is null or (aliq_icms >= 0 and aliq_icms <= 100)),
  constraint regras_fiscais_reducao_faixa check (reducao_bc_pct is null or (reducao_bc_pct >= 0 and reducao_bc_pct <= 100))
);

create unique index if not exists regras_fiscais_org_chave_key
  on public.regras_fiscais (organization_id, operacao, destino, tipo_pessoa, presencial);

-- ---------------------------------------------------------------------------
-- documentos_fiscais
-- ---------------------------------------------------------------------------
create table if not exists public.documentos_fiscais (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- 55 | 65 | NFSE (hoje só 55)
  modelo text not null default '55',
  operacao text not null,
  -- entrada | saida
  tipo text not null,
  -- normal | complementar | ajuste | devolucao | credito | debito
  finalidade text not null default 'normal',
  -- rascunho | processando | autorizada | rejeitada | denegada | cancelada | inutilizada
  status text not null default 'rascunho',

  numero bigint,
  serie int,
  chave text,
  protocolo text,
  -- Referência enviada ao provedor; única por documento.
  ref_provider text,
  ambiente text not null default 'homologacao',
  data_emissao timestamptz,
  valor_total_cents bigint not null default 0,
  cfop text,

  veiculo_id uuid references public.veiculos(id) on delete set null,
  negociacao_id uuid references public.negociacoes_de_veiculo(id) on delete set null,
  contrato_id uuid,
  pessoa_id uuid references public.contacts(id) on delete set null,
  doc_referenciado_id uuid references public.documentos_fiscais(id) on delete set null,

  -- Rascunho montado pelo sistema (editável até emitir) e o que foi enviado.
  rascunho jsonb not null default '{}'::jsonb,
  json_enviado jsonb,
  retorno_provider jsonb,
  motivo_rejeicao text,
  xml_url text,
  pdf_url text,

  renave_enviado_em timestamptz,
  renave_status text,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint documentos_fiscais_valor_nao_negativo check (valor_total_cents >= 0),
  constraint documentos_fiscais_chave_44 check (chave is null or chave ~ '^[0-9]{44}$')
);

create unique index if not exists documentos_fiscais_ref_provider_key
  on public.documentos_fiscais (ref_provider)
  where ref_provider is not null;
-- Número é único por emitente/série/ambiente; só vale para notas já numeradas.
create unique index if not exists documentos_fiscais_org_numero_key
  on public.documentos_fiscais (organization_id, modelo, serie, ambiente, numero)
  where numero is not null;
create index if not exists documentos_fiscais_org_status_idx
  on public.documentos_fiscais (organization_id, status, created_at desc);
create index if not exists documentos_fiscais_veiculo_idx
  on public.documentos_fiscais (veiculo_id) where veiculo_id is not null;

-- ---------------------------------------------------------------------------
-- documento_fiscal_eventos
-- ---------------------------------------------------------------------------
create table if not exists public.documento_fiscal_eventos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  documento_id uuid references public.documentos_fiscais(id) on delete cascade,

  -- cancelamento | cce | inutilizacao
  tipo text not null,
  sequencia int not null default 1,
  texto text,
  protocolo text,
  status text not null default 'pendente',
  -- Inutilização não tem documento: guarda a faixa aqui.
  serie int,
  numero_inicial bigint,
  numero_final bigint,
  retorno_provider jsonb,
  data timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists documento_fiscal_eventos_doc_idx
  on public.documento_fiscal_eventos (documento_id, tipo, sequencia);
create index if not exists documento_fiscal_eventos_org_idx
  on public.documento_fiscal_eventos (organization_id, data desc);

-- ---------------------------------------------------------------------------
-- RLS: leitura para a organização; escrita só service role.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['config_fiscal_loja','regras_fiscais','documentos_fiscais','documento_fiscal_eventos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select using ((organization_id in (select public.fn_user_org_ids())) or (select public.fn_is_platform_admin()))',
      t || '_select', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

grant select on public.regras_fiscais to authenticated;
grant select on public.documentos_fiscais to authenticated;
grant select on public.documento_fiscal_eventos to authenticated;
-- Config: tudo, exceto token cifrado, iv, tag e segredo do webhook.
grant select (
  id, organization_id, cnpj, razao_social, nome_fantasia, inscricao_estadual,
  inscricao_municipal, crt, cnae, logradouro, numero, complemento, bairro,
  municipio, uf, cep, telefone, ambiente, serie_nfe, proximo_numero_nfe,
  provider, provider_empresa_id, certificado_validade, certificado_enviado_em,
  email_contador, credenciado_sefaz, regras_revisadas_em, nota_teste_ok_em,
  ativo, created_at, updated_at
) on public.config_fiscal_loja to authenticated;

do $$
declare t text;
begin
  foreach t in array array['config_fiscal_loja','regras_fiscais','documentos_fiscais']
  loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.fn_set_updated_at()',
      'trg_' || t || '_updated_at', t);
  end loop;
end $$;

comment on table public.config_fiscal_loja is
  'Config fiscal por loja (CNPJ). Token do provedor cifrado (AES-GCM); certificado A1 nunca é gravado, só a validade. Escrita só por app/api/v1/fiscal.';
comment on table public.regras_fiscais is
  'CFOP/CST/alíquotas/IBS-CBS por operação, por loja. Seed pela função fn_semear_regras_fiscais (9051). validado_contador=false bloqueia produção no regime normal.';
comment on table public.documentos_fiscais is
  'Notas fiscais. Toda nota nasce rascunho; o usuário revisa e emite. Dados do veículo usado vão em infAdProd (sem grupo veicProd).';
comment on table public.documento_fiscal_eventos is
  'Eventos fiscais: cancelamento, carta de correção (CC-e) e inutilização.';
