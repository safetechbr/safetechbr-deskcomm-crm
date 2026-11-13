-- manifest: Dados contratuais da empresa, fotografia editável por negociação e condição/regularização do veículo conforme modelo fornecido pela loja.
alter table public.organizations add column if not exists dados_contrato jsonb;
alter table public.negociacoes_de_veiculo add column if not exists contrato jsonb;
alter table public.veiculos add column if not exists condicao text;
alter table public.veiculos add column if not exists regularizacao jsonb not null default '[]'::jsonb;
comment on column public.negociacoes_de_veiculo.contrato is 'Fotografia dos dados da empresa e termos revisados para esta negociação. Schema lib/pdv/modelo-contrato.ts.';

alter table public.organizations drop constraint if exists organizations_dados_contrato_objeto;
alter table public.organizations add constraint organizations_dados_contrato_objeto check (dados_contrato is null or jsonb_typeof(dados_contrato) = 'object');
alter table public.negociacoes_de_veiculo drop constraint if exists negociacao_contrato_objeto;
alter table public.negociacoes_de_veiculo add constraint negociacao_contrato_objeto check (contrato is null or jsonb_typeof(contrato) = 'object');
alter table public.veiculos drop constraint if exists veiculos_condicao;
alter table public.veiculos add constraint veiculos_condicao check (condicao is null or condicao in ('novo', 'usado'));
alter table public.veiculos drop constraint if exists veiculos_regularizacao_array;
alter table public.veiculos add constraint veiculos_regularizacao_array check (jsonb_typeof(regularizacao) = 'array' and jsonb_array_length(regularizacao) <= 30);

-- A conclusão existente cria os veículos e grava seus IDs na mesma transação.
-- Completar os dois campos novos aqui conserva os snapshots da compra/troca,
-- sem alterar o cadastro do carro que foi vendido.
create or replace function public.fn_dados_contratuais_do_veiculo_recebido()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.status = 'concluida' and old.status = 'rascunho' then
    if new.tipo = 'compra' and new.veiculo_id is not null then
      update public.veiculos set condicao = nullif(new.veiculo->>'condicao', ''),
        regularizacao = coalesce(new.veiculo->'regularizacao', '[]'::jsonb)
        where id = new.veiculo_id and organization_id = new.organization_id;
    end if;
    if new.tipo = 'venda' and new.troca_veiculo_id is not null then
      update public.veiculos set condicao = nullif(new.troca->>'condicao', ''),
        regularizacao = coalesce(new.troca->'regularizacao', '[]'::jsonb)
        where id = new.troca_veiculo_id and organization_id = new.organization_id;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_dados_contratuais_do_veiculo_recebido() from public, anon;
grant execute on function public.fn_dados_contratuais_do_veiculo_recebido() to authenticated, service_role;
drop trigger if exists trg_dados_contratuais_do_veiculo_recebido on public.negociacoes_de_veiculo;
create trigger trg_dados_contratuais_do_veiculo_recebido after update of status on public.negociacoes_de_veiculo
  for each row execute function public.fn_dados_contratuais_do_veiculo_recebido();
