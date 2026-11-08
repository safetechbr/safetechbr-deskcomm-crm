-- manifest: Crediário mensal do PDV, parcelas no financeiro existente, juros opcionais sobre o saldo e operações atômicas que preservam parcelas pagas.
alter table public.negociacoes_de_veiculo add column if not exists modalidade text not null default 'normal' check (modalidade in ('normal','crediario','reserva'));

create or replace function public.fn_pdv_gerar_crediario() returns trigger language plpgsql security definer set search_path=public as $$
declare p jsonb; qtd int; total bigint; base bigint; conta uuid; venc date; i int;
begin
 if new.status <> 'concluida' or old.status = 'concluida' then return new; end if;
 for p in select value from jsonb_array_elements(new.pagamentos) loop
  if p->>'forma' <> 'crediario' then
   if (p->>'valor_cents')::bigint > 0 and nullif(p->>'conta_id','') is not null then
    conta:=(p->>'conta_id')::uuid;
    if not exists(select 1 from financial_accounts where id=conta and organization_id=new.organization_id and is_active and currency=new.moeda) then raise exception 'Conta financeira inválida.'; end if;
    insert into financial_entries(organization_id,account_id,direction,amount_cents,currency,description,entry_date,status,paid_at,origin,negociacao_id,veiculo_id,forma_pagamento,created_by_user_id)
    values(new.organization_id,conta,case when new.tipo='compra' then 'out' else 'in' end,(p->>'valor_cents')::bigint,new.moeda,'Pagamento da negociação #'||new.numero,current_date,'paid',now(),'negociacao',new.id,new.veiculo_id,p->>'forma',auth.uid());
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
drop trigger if exists pdv_gerar_crediario on public.negociacoes_de_veiculo;
create trigger pdv_gerar_crediario after update of status on public.negociacoes_de_veiculo for each row execute function public.fn_pdv_gerar_crediario();

create or replace function public.fn_pdv_crediario_operar(p_id uuid,p_operacao text,p_dados jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
declare n negociacoes_de_veiculo%rowtype; e financial_entries%rowtype; qtd int; saldo bigint; base bigint; venc date; i int; conta uuid; pagos int; taxa int;
begin
 select * into n from negociacoes_de_veiculo where id=p_id for update;
 if not found or n.organization_id not in(select fn_user_org_ids()) or not fn_role_at_least(n.organization_id,'agent') or not fn_support_write_allowed(n.organization_id) then
  raise exception 'Sem permissão.' using errcode='42501';
 end if;
 if n.status <> 'concluida' then raise exception 'A venda precisa estar concluída.'; end if;
 if p_operacao in ('receber','editar') then
  select * into e from financial_entries where id=(p_dados->>'parcela_id')::uuid and negociacao_id=n.id and organization_id=n.organization_id and forma_pagamento='crediario' for update;
  if not found then raise exception 'Parcela não encontrada.'; end if;
  if e.status='paid' then
   if p_operacao='receber' then return; end if;
   raise exception 'Parcela paga não pode ser alterada.';
  end if;
  if p_operacao='receber' then
   update financial_entries set status='paid',paid_at=now(),updated_at=now() where id=e.id;
  else
   if not fn_role_at_least(n.organization_id,'manager') then raise exception 'Só gerentes podem editar parcelas.' using errcode='42501'; end if;
   if (p_dados->>'valor_cents')::bigint <= 0 or (p_dados->>'valor_cents') is null or (p_dados->>'vencimento') is null then raise exception 'Informe valor e vencimento válidos.'; end if;
   update financial_entries set amount_cents=(p_dados->>'valor_cents')::bigint,due_date=(p_dados->>'vencimento')::date,updated_at=now() where id=e.id;
  end if;
 elsif p_operacao='recalcular' then
  if not fn_role_at_least(n.organization_id,'manager') then raise exception 'Só gerentes podem recalcular parcelas.' using errcode='42501'; end if;
  perform 1 from financial_entries where negociacao_id=n.id and organization_id=n.organization_id and forma_pagamento='crediario' for update;
  select sum(amount_cents), (array_agg(account_id))[1] into saldo,conta from financial_entries where negociacao_id=n.id and organization_id=n.organization_id and forma_pagamento='crediario' and status='pending';
  select count(*) into pagos from financial_entries where negociacao_id=n.id and organization_id=n.organization_id and forma_pagamento='crediario' and status='paid';
  qtd:=(p_dados->>'parcelas')::int; venc:=(p_dados->>'vencimento')::date; taxa:=coalesce((p_dados->>'juros_bps')::int,0);
  if qtd is null or qtd not between 1 and 120 or venc is null or saldo is null or taxa not between 0 and 10000 then raise exception 'Configuração inválida.'; end if;
  saldo:=round(saldo::numeric*(1+taxa::numeric/10000));
  if saldo < qtd then raise exception 'Valor insuficiente para este número de parcelas.'; end if;
  delete from financial_entries where negociacao_id=n.id and organization_id=n.organization_id and forma_pagamento='crediario' and status='pending';
  base:=saldo/qtd;
  for i in 1..qtd loop
   insert into financial_entries(organization_id,account_id,direction,amount_cents,currency,description,entry_date,due_date,status,origin,negociacao_id,veiculo_id,parcela_numero,parcela_total,forma_pagamento,created_by_user_id)
   values(n.organization_id,conta,'in',base+case when i<=saldo%qtd then 1 else 0 end,n.moeda,'Crediário recalculado da venda #'||n.numero,current_date,(venc+make_interval(months=>i-1))::date,'pending','negociacao',n.id,n.veiculo_id,pagos+i,pagos+qtd,'crediario',auth.uid());
  end loop;
 else raise exception 'Operação desconhecida.'; end if;
end $$;
revoke all on function public.fn_pdv_crediario_operar(uuid,text,jsonb) from public,anon;
grant execute on function public.fn_pdv_crediario_operar(uuid,text,jsonb) to authenticated;
