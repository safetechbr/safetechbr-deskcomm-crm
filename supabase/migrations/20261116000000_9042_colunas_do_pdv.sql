-- manifest: Colunas reais para cada campo do PDV (cliente_*, veiculo_*, troca_*, contrato_*) como colunas geradas do JSONB, mais a tabela negociacoes_de_veiculo_pagamentos com uma linha por pagamento. Sem trigger de escrita: o banco deriva sozinho, então nenhum campo digitado fica só dentro de um bloco JSON.

alter table public.negociacoes_de_veiculo
  add column if not exists cliente_nome text generated always as (((cliente->>'nome')::text)) stored,
  add column if not exists cliente_documento text generated always as (((cliente->>'documento')::text)) stored,
  add column if not exists cliente_rg text generated always as (((cliente->>'rg')::text)) stored,
  add column if not exists cliente_rg_orgao_expedidor text generated always as (((cliente->>'rg_orgao_expedidor')::text)) stored,
  add column if not exists cliente_rg_uf text generated always as (((cliente->>'rg_uf')::text)) stored,
  add column if not exists cliente_cnh text generated always as (((cliente->>'cnh')::text)) stored,
  add column if not exists cliente_telefone text generated always as (((cliente->>'telefone')::text)) stored,
  add column if not exists cliente_email text generated always as (((cliente->>'email')::text)) stored,
  add column if not exists cliente_nascimento text generated always as (((cliente->>'nascimento')::text)) stored,
  add column if not exists cliente_cep text generated always as (((cliente->>'cep')::text)) stored,
  add column if not exists cliente_endereco text generated always as (((cliente->>'endereco')::text)) stored,
  add column if not exists cliente_numero text generated always as (((cliente->>'numero')::text)) stored,
  add column if not exists cliente_complemento text generated always as (((cliente->>'complemento')::text)) stored,
  add column if not exists cliente_bairro text generated always as (((cliente->>'bairro')::text)) stored,
  add column if not exists cliente_cidade text generated always as (((cliente->>'cidade')::text)) stored,
  add column if not exists cliente_uf text generated always as (((cliente->>'uf')::text)) stored,
  add column if not exists cliente_nacionalidade text generated always as (((cliente->>'nacionalidade')::text)) stored,
  add column if not exists cliente_estado_civil text generated always as (((cliente->>'estado_civil')::text)) stored,
  add column if not exists cliente_profissao text generated always as (((cliente->>'profissao')::text)) stored,
  add column if not exists cliente_documentos jsonb generated always as ((cliente->'documentos')) stored,
  add column if not exists veiculo_condicao text generated always as (((veiculo->>'condicao')::text)) stored,
  add column if not exists veiculo_regularizacao jsonb generated always as ((veiculo->'regularizacao')) stored,
  add column if not exists veiculo_codigo text generated always as (((veiculo->>'codigo')::text)) stored,
  add column if not exists veiculo_marca text generated always as (((veiculo->>'marca')::text)) stored,
  add column if not exists veiculo_modelo text generated always as (((veiculo->>'modelo')::text)) stored,
  add column if not exists veiculo_versao text generated always as (((veiculo->>'versao')::text)) stored,
  add column if not exists veiculo_ano_fabricacao integer generated always as (((veiculo->>'ano_fabricacao')::integer)) stored,
  add column if not exists veiculo_ano_modelo integer generated always as (((veiculo->>'ano_modelo')::integer)) stored,
  add column if not exists veiculo_km integer generated always as (((veiculo->>'km')::integer)) stored,
  add column if not exists veiculo_cor text generated always as (((veiculo->>'cor')::text)) stored,
  add column if not exists veiculo_combustivel text generated always as (((veiculo->>'combustivel')::text)) stored,
  add column if not exists veiculo_cambio text generated always as (((veiculo->>'cambio')::text)) stored,
  add column if not exists veiculo_motor text generated always as (((veiculo->>'motor')::text)) stored,
  add column if not exists veiculo_placa text generated always as (((veiculo->>'placa')::text)) stored,
  add column if not exists veiculo_chassi text generated always as (((veiculo->>'chassi')::text)) stored,
  add column if not exists veiculo_renavam text generated always as (((veiculo->>'renavam')::text)) stored,
  add column if not exists veiculo_preco_venda_cents bigint generated always as (((veiculo->>'preco_venda_cents')::bigint)) stored,
  add column if not exists troca_condicao text generated always as (((troca->>'condicao')::text)) stored,
  add column if not exists troca_regularizacao jsonb generated always as ((troca->'regularizacao')) stored,
  add column if not exists troca_codigo text generated always as (((troca->>'codigo')::text)) stored,
  add column if not exists troca_marca text generated always as (((troca->>'marca')::text)) stored,
  add column if not exists troca_modelo text generated always as (((troca->>'modelo')::text)) stored,
  add column if not exists troca_versao text generated always as (((troca->>'versao')::text)) stored,
  add column if not exists troca_ano_fabricacao integer generated always as (((troca->>'ano_fabricacao')::integer)) stored,
  add column if not exists troca_ano_modelo integer generated always as (((troca->>'ano_modelo')::integer)) stored,
  add column if not exists troca_km integer generated always as (((troca->>'km')::integer)) stored,
  add column if not exists troca_cor text generated always as (((troca->>'cor')::text)) stored,
  add column if not exists troca_combustivel text generated always as (((troca->>'combustivel')::text)) stored,
  add column if not exists troca_cambio text generated always as (((troca->>'cambio')::text)) stored,
  add column if not exists troca_motor text generated always as (((troca->>'motor')::text)) stored,
  add column if not exists troca_placa text generated always as (((troca->>'placa')::text)) stored,
  add column if not exists troca_chassi text generated always as (((troca->>'chassi')::text)) stored,
  add column if not exists troca_renavam text generated always as (((troca->>'renavam')::text)) stored,
  add column if not exists troca_valor_cents bigint generated always as (((troca->>'valor_cents')::bigint)) stored,
  add column if not exists troca_quitacao_cents bigint generated always as (((troca->>'quitacao_cents')::bigint)) stored,
  add column if not exists troca_entra_no_estoque boolean generated always as (((troca->>'entra_no_estoque')::boolean)) stored,
  add column if not exists troca_gravame_credor text generated always as (((troca->>'gravame_credor')::text)) stored,
  add column if not exists contrato_local text generated always as (((contrato->>'local')::text)) stored,
  add column if not exists contrato_assinatura_em text generated always as (((contrato->>'assinatura_em')::text)) stored,
  add column if not exists contrato_entrega_em text generated always as (((contrato->>'entrega_em')::text)) stored,
  add column if not exists contrato_recebimento_troca_em text generated always as (((contrato->>'recebimento_troca_em')::text)) stored,
  add column if not exists contrato_atendido_por text generated always as (((contrato->>'atendido_por')::text)) stored,
  add column if not exists contrato_clausulas jsonb generated always as ((contrato->'clausulas')) stored,
  add column if not exists contrato_clausula_especial text generated always as (((contrato->>'clausula_especial')::text)) stored,
  add column if not exists contrato_entrega_hora text generated always as (((contrato->>'entrega_hora')::text)) stored,
  add column if not exists contrato_recebimento_troca_hora text generated always as (((contrato->>'recebimento_troca_hora')::text)) stored,
  add column if not exists contrato_representante_nome text generated always as (((contrato->>'representante_nome')::text)) stored,
  add column if not exists contrato_representante_cpf text generated always as (((contrato->>'representante_cpf')::text)) stored,
  add column if not exists contrato_representante_cargo text generated always as (((contrato->>'representante_cargo')::text)) stored,
  add column if not exists contrato_consulta_debitos_em text generated always as (((contrato->>'consulta_debitos_em')::text)) stored,
  add column if not exists contrato_debitos jsonb generated always as ((contrato->'debitos')) stored,
  add column if not exists contrato_test_drive text generated always as (((contrato->>'test_drive')::text)) stored,
  add column if not exists contrato_transferencia_taxas_por text generated always as (((contrato->>'transferencia_taxas_por')::text)) stored,
  add column if not exists contrato_transferencia_prazo_dias integer generated always as (((contrato->>'transferencia_prazo_dias')::integer)) stored,
  add column if not exists contrato_transferencia_conta_de text generated always as (((contrato->>'transferencia_conta_de')::text)) stored,
  add column if not exists contrato_despachante_cents bigint generated always as (((contrato->>'despachante_cents')::bigint)) stored,
  add column if not exists contrato_quitacao_troca_prazo_dias integer generated always as (((contrato->>'quitacao_troca_prazo_dias')::integer)) stored,
  add column if not exists contrato_financiamento_prazo_dias integer generated always as (((contrato->>'financiamento_prazo_dias')::integer)) stored,
  add column if not exists contrato_retencao_percentual_mes numeric generated always as (((contrato->>'retencao_percentual_mes')::numeric)) stored,
  add column if not exists contrato_garantia_contratual jsonb generated always as ((contrato->'garantia_contratual')) stored,
  add column if not exists contrato_venda_fora_do_estabelecimento boolean generated always as (((contrato->>'venda_fora_do_estabelecimento')::boolean)) stored,
  add column if not exists contrato_email_lgpd text generated always as (((contrato->>'email_lgpd')::text)) stored,
  add column if not exists contrato_testemunhas jsonb generated always as ((contrato->'testemunhas')) stored,
  add column if not exists contrato_empresa jsonb generated always as ((contrato->'empresa')) stored;

create table if not exists public.negociacoes_de_veiculo_pagamentos (
  negociacao_id uuid not null references public.negociacoes_de_veiculo(id) on delete cascade,
  organization_id uuid not null,
  posicao integer not null,
  forma text not null,
  conta_id uuid,
  valor_cents bigint not null default 0,
  parcelas integer not null default 1,
  valor_parcela_cents bigint,
  juros_bps integer,
  banco text,
  primeiro_vencimento text,
  observacao text,
  situacao text,
  data_emissao text,
  data_pagamento text,
  intervalo_dias integer,
  chave_pix text,
  bandeira text,
  created_at timestamptz not null default now(),
  primary key (negociacao_id, posicao)
);
create index if not exists negociacoes_de_veiculo_pagamentos_org_idx on public.negociacoes_de_veiculo_pagamentos (organization_id);
alter table public.negociacoes_de_veiculo_pagamentos enable row level security;
drop policy if exists negociacoes_de_veiculo_pagamentos_select on public.negociacoes_de_veiculo_pagamentos;
create policy negociacoes_de_veiculo_pagamentos_select on public.negociacoes_de_veiculo_pagamentos
  for select using ((organization_id in (select public.fn_user_org_ids())) or (select public.fn_is_platform_admin()));

create or replace function public.fn_sincroniza_pagamentos_da_negociacao() returns trigger
    language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  delete from public.negociacoes_de_veiculo_pagamentos where negociacao_id = new.id;
  insert into public.negociacoes_de_veiculo_pagamentos
    (negociacao_id, organization_id, posicao, forma, conta_id, valor_cents, parcelas, valor_parcela_cents,
     juros_bps, banco, primeiro_vencimento, observacao, situacao, data_emissao, data_pagamento,
     intervalo_dias, chave_pix, bandeira)
  select new.id, new.organization_id, (p.ord - 1)::int, p.v->>'forma', nullif(p.v->>'conta_id','')::uuid,
    coalesce((p.v->>'valor_cents')::bigint, 0), coalesce((p.v->>'parcelas')::int, 1),
    (p.v->>'valor_parcela_cents')::bigint, (p.v->>'juros_bps')::int, p.v->>'banco',
    p.v->>'primeiro_vencimento', p.v->>'observacao', p.v->>'situacao', p.v->>'data_emissao',
    p.v->>'data_pagamento', (p.v->>'intervalo_dias')::int, p.v->>'chave_pix', p.v->>'bandeira'
  from jsonb_array_elements(coalesce(new.pagamentos, '[]'::jsonb)) with ordinality as p(v, ord);
  return null;
end$$;
revoke all on function public.fn_sincroniza_pagamentos_da_negociacao() from public, anon, authenticated;

drop trigger if exists trg_sincroniza_pagamentos on public.negociacoes_de_veiculo;
create trigger trg_sincroniza_pagamentos
  after insert or update of pagamentos on public.negociacoes_de_veiculo
  for each row execute function public.fn_sincroniza_pagamentos_da_negociacao();

-- Preenche as negociações que já existem.
update public.negociacoes_de_veiculo set pagamentos = pagamentos;
notify pgrst, 'reload schema';
