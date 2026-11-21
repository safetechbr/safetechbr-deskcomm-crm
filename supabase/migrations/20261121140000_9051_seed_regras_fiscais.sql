-- manifest: Função `fn_semear_regras_fiscais(org, crt)` que cria as regras fiscais padrão (compra de PF, troca e venda de veículo) com validado_contador=false; idempotente, não sobrescreve edição da loja.
-- ============================================================================
-- 9051 — SEED DAS REGRAS FISCAIS PADRÃO
--
-- Só sugestão: toda linha nasce validado_contador=false. No regime normal
-- (CRT 3) CST/alíquota/redução ficam vazios até o contador validar, e a
-- emissão em produção é bloqueada pela aplicação enquanto não validar.
-- Simples (CRT 1/2/4): CSOSN 102 na saída; entrada sem destaque (CSOSN 900,
-- editável conforme o contador).
-- Venda presencial a consumidor de outra UF é tratada como interna
-- (CFOP 5.102, idDest=1).
-- ============================================================================

create or replace function public.fn_semear_regras_fiscais(p_org uuid, p_crt int default 1)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_simples boolean := coalesce(p_crt, 1) in (1, 2, 4);
  v_ent text := 'Compra para comercialização – veículo usado de pessoa física';
  v_sai text := 'Venda de mercadoria adquirida ou recebida de terceiros – veículo usado';
  v_n int;
begin
  insert into public.regras_fiscais
    (organization_id, operacao, destino, tipo_pessoa, presencial, cfop,
     natureza_operacao, csosn_ou_cst, validado_contador, ativo)
  select p_org, r.operacao, r.destino, r.tipo_pessoa, r.presencial, r.cfop,
         r.natureza,
         case when v_simples then r.csosn_simples else null end,
         false, true
  from (values
    ('ENT_COMPRA_PF', 'interna',      'PF', true, '1102', v_ent, '900'),
    ('ENT_COMPRA_PF', 'interestadual','PF', true, '2102', v_ent, '900'),
    ('ENT_TROCA',     'interna',      'PF', true, '1102', v_ent, '900'),
    ('ENT_TROCA',     'interestadual','PF', true, '2102', v_ent, '900'),
    ('SAI_VENDA', 'interna',      'PF',            true,  '5102', v_sai, '102'),
    ('SAI_VENDA', 'interna',      'PJ_contrib',    true,  '5102', v_sai, '102'),
    ('SAI_VENDA', 'interna',      'PJ_nao_contrib',true,  '5102', v_sai, '102'),
    ('SAI_VENDA', 'interestadual','PJ_contrib',    true,  '6102', v_sai, '102'),
    ('SAI_VENDA', 'interestadual','PJ_contrib',    false, '6102', v_sai, '102'),
    ('SAI_VENDA', 'interestadual','PF',            false, '6108', v_sai, '102'),
    ('SAI_VENDA', 'interestadual','PJ_nao_contrib',false, '6108', v_sai, '102'),
    ('SAI_VENDA', 'interestadual','PF',            true,  '5102', v_sai, '102'),
    ('SAI_VENDA', 'interestadual','PJ_nao_contrib',true,  '5102', v_sai, '102')
  ) as r(operacao, destino, tipo_pessoa, presencial, cfop, natureza, csosn_simples)
  on conflict (organization_id, operacao, destino, tipo_pessoa, presencial) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.fn_semear_regras_fiscais(uuid, int) from public, anon, authenticated;
grant execute on function public.fn_semear_regras_fiscais(uuid, int) to service_role;

comment on function public.fn_semear_regras_fiscais(uuid, int) is
  'Semeia regras fiscais padrão da loja (validado_contador=false). Idempotente. Chamada só pelo servidor.';
