-- manifest: Função `fn_nfe_autorizada(doc)`: ao autorizar uma NF-e preenche no veículo custo_aquisicao/origem/nfe_entrada_id (entradas) ou nfe_saida_id (venda) e grava o evento `nfe.autorizada` no event_log, numa só transação e uma única vez por nota. Só service_role executa. Aditiva e idempotente.
create or replace function public.fn_nfe_autorizada(p_doc uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.documentos_fiscais;
begin
  -- Trava a linha e marca antes: a segunda chamada (webhook + cron) não repete o efeito.
  select * into d from public.documentos_fiscais where id = p_doc for update;
  if not found or d.status <> 'autorizada' or d.autorizada_em is not null then
    return false;
  end if;

  update public.documentos_fiscais set autorizada_em = now() where id = d.id;

  if d.veiculo_id is not null then
    if d.operacao in ('ENT_COMPRA_PF', 'ENT_TROCA') then
      update public.veiculos
         set custo_aquisicao = d.valor_total_cents,
             origem = case d.operacao when 'ENT_TROCA' then 'troca' else 'compra_pf' end,
             nfe_entrada_id = d.id
       where id = d.veiculo_id and organization_id = d.organization_id;
    elsif d.operacao = 'SAI_VENDA' then
      update public.veiculos
         set nfe_saida_id = d.id
       where id = d.veiculo_id and organization_id = d.organization_id;
    end if;
  end if;

  insert into public.event_log (organization_id, event_type, entity_kind, entity_id, payload)
  values (d.organization_id, 'nfe.autorizada', 'documento_fiscal', d.id,
          jsonb_build_object('operacao', d.operacao, 'veiculo_id', d.veiculo_id,
                             'negociacao_id', d.negociacao_id, 'chave', d.chave,
                             'valor_total_cents', d.valor_total_cents));
  return true;
end;
$$;
revoke all on function public.fn_nfe_autorizada(uuid) from public, anon, authenticated;
grant execute on function public.fn_nfe_autorizada(uuid) to service_role;
