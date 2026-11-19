-- manifest: PDV deixa de lançar como recebido o que só está previsto: financiamento/consórcio viram 1 a receber do banco; cartão de crédito, boleto, cheque e promissória viram parcelas pendentes; pix/dinheiro/transferência/débito/quitação seguem pagos na hora. Só vendas concluídas daqui em diante.
-- Antes: todo pagamento que não era crediário entrava `paid` com `now()`, então o
-- caixa mostrava como recebido um financiamento que o banco ainda não liberou ou
-- um boleto de 6 parcelas. Baixa das pendentes: botão "Marcar como pago" nas
-- Movimentações (PATCH /api/v1/financeiro/lancamentos/[id] {pay:true}).
-- O ramo do crediário não mudou.
create or replace function public.fn_pdv_gerar_crediario() returns trigger language plpgsql security definer set search_path=public as $$
declare p jsonb; qtd int; total bigint; base bigint; conta uuid; venc date; i int; passo int; dir text; forma text;
begin
 if new.status <> 'concluida' or old.status = 'concluida' then return new; end if;
 dir := case when new.tipo='compra' then 'out' else 'in' end;
 for p in select value from jsonb_array_elements(new.pagamentos) loop
  forma := p->>'forma';
  if forma <> 'crediario' then
   total := coalesce((p->>'valor_cents')::bigint, 0);
   if total > 0 and nullif(p->>'conta_id','') is not null then
    conta:=(p->>'conta_id')::uuid;
    if not exists(select 1 from financial_accounts where id=conta and organization_id=new.organization_id and is_active and currency=new.moeda) then raise exception 'Conta financeira inválida.'; end if;
    if forma in ('financiamento','consorcio') then
     -- O cliente paga as parcelas ao banco; a loja recebe o valor cheio de uma vez.
     insert into financial_entries(organization_id,account_id,direction,amount_cents,currency,description,entry_date,due_date,status,origin,negociacao_id,veiculo_id,forma_pagamento,created_by_user_id)
     values(new.organization_id,conta,dir,total,new.moeda,'Pagamento da negociação #'||new.numero,current_date,coalesce(nullif(p->>'data_pagamento','')::date,current_date),'pending','negociacao',new.id,new.veiculo_id,forma,auth.uid());
    elsif forma in ('cartao_credito','boleto','cheque','promissoria') then
     qtd := least(greatest(coalesce(nullif(p->>'parcelas','')::int,1),1),120);
     if total < qtd then qtd := 1; end if;
     venc := coalesce(nullif(p->>'primeiro_vencimento','')::date, nullif(p->>'data_pagamento','')::date,
                      current_date + case when forma='cartao_credito' then 30 else 0 end);
     passo := nullif(p->>'intervalo_dias','')::int;
     base := total / qtd;
     for i in 1..qtd loop
      insert into financial_entries(organization_id,account_id,direction,amount_cents,currency,description,entry_date,due_date,status,origin,negociacao_id,veiculo_id,parcela_numero,parcela_total,forma_pagamento,created_by_user_id)
      values(new.organization_id,conta,dir,base + case when i <= total % qtd then 1 else 0 end,new.moeda,'Pagamento da negociação #'||new.numero,current_date,
             case when passo > 0 then venc + passo*(i-1) else (venc + make_interval(months=>i-1))::date end,
             'pending','negociacao',new.id,new.veiculo_id,case when qtd>1 then i end,case when qtd>1 then qtd end,forma,auth.uid());
     end loop;
    else
     insert into financial_entries(organization_id,account_id,direction,amount_cents,currency,description,entry_date,status,paid_at,origin,negociacao_id,veiculo_id,forma_pagamento,created_by_user_id)
     values(new.organization_id,conta,dir,total,new.moeda,'Pagamento da negociação #'||new.numero,current_date,'paid',now(),'negociacao',new.id,new.veiculo_id,forma,auth.uid());
    end if;
   end if;
   continue;
  end if;
  if new.tipo <> 'venda' then raise exception 'Crediário só pode ser usado em venda.'; end if;
  qtd := (p->>'parcelas')::int; conta := (p->>'conta_id')::uuid; venc := (p->>'primeiro_vencimento')::date;
  total := round((p->>'valor_cents')::numeric * (1 + coalesce((p->>'juros_bps')::numeric,0)/10000));
  if qtd is null or qtd not between 1 and 120 or venc is null or total < qtd or coalesce((p->>'juros_bps')::int,0) not between 0 and 10000 then raise exception 'Configuração inválida do crediário.'; end if;
  if not exists(select 1 from financial_accounts where id=conta and organization_id=new.organization_id and is_active and currency=new.moeda) then raise exception 'Selecione uma conta ativa da empresa na moeda da venda.'; end if;
  base := total / qtd;
  for i in 1..qtd loop
   insert into financial_entries(organization_id,account_id,direction,amount_cents,currency,description,entry_date,due_date,status,origin,negociacao_id,veiculo_id,parcela_numero,parcela_total,forma_pagamento,created_by_user_id)
   values(new.organization_id,conta,'in',base + case when i <= total % qtd then 1 else 0 end,new.moeda,'Crediário da venda #'||new.numero,current_date,(venc + make_interval(months=>i-1))::date,'pending','negociacao',new.id,new.veiculo_id,i,qtd,'crediario',auth.uid());
  end loop;
 end loop;
 return new;
end $$;
revoke all on function public.fn_pdv_gerar_crediario() from public,anon,authenticated;
