-- manifest: Impede que contatos ativos da mesma organização compartilhem um CNPJ.

do $$
begin
  create unique index if not exists uniq_contacts_org_cnpj
    on public.contacts (organization_id, (regexp_replace(custom_fields #>> '{cadastro_cliente,cnpj}', '[^0-9]', '', 'g')))
    where is_merged_into is null
      and length(regexp_replace(custom_fields #>> '{cadastro_cliente,cnpj}', '[^0-9]', '', 'g')) = 14;
exception when unique_violation then
  -- Preserva fichas antigas duplicadas e instala a proteção para novas gravações.
  create index if not exists idx_contacts_org_cnpj
    on public.contacts (organization_id, (regexp_replace(custom_fields #>> '{cadastro_cliente,cnpj}', '[^0-9]', '', 'g')))
    where is_merged_into is null
      and length(regexp_replace(custom_fields #>> '{cadastro_cliente,cnpj}', '[^0-9]', '', 'g')) = 14;
end
$$;

create or replace function public.fn_guardar_cnpj_unico_do_contato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cnpj text := regexp_replace(new.custom_fields #>> '{cadastro_cliente,cnpj}', '[^0-9]', '', 'g');
begin
  if new.is_merged_into is not null or coalesce(length(cnpj), 0) <> 14 then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.is_merged_into is null and old.organization_id = new.organization_id
       and regexp_replace(old.custom_fields #>> '{cadastro_cliente,cnpj}', '[^0-9]', '', 'g') = cnpj then
      return new;
    end if;
  end if;
  -- A consulta depois do lock precisa enxergar o commit da outra gravação.
  if current_setting('transaction_isolation') = 'repeatable read' then
    raise serialization_failure using message = 'Grave o CNPJ com isolamento READ COMMITTED ou SERIALIZABLE.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || ':' || cnpj, 0));
  if exists (
    select 1 from public.contacts c
    where c.organization_id = new.organization_id and c.is_merged_into is null
      and c.id <> new.id
      and length(regexp_replace(c.custom_fields #>> '{cadastro_cliente,cnpj}', '[^0-9]', '', 'g')) = 14
      and regexp_replace(c.custom_fields #>> '{cadastro_cliente,cnpj}', '[^0-9]', '', 'g') = cnpj
  ) then
    raise unique_violation using constraint = 'uniq_contacts_org_cnpj',
      message = 'duplicate key value violates unique constraint "uniq_contacts_org_cnpj"';
  end if;
  return new;
end
$$;

revoke execute on function public.fn_guardar_cnpj_unico_do_contato() from public, anon, authenticated;

drop trigger if exists contatos_cnpj_unico on public.contacts;
do $$
begin
  if to_regclass('public.uniq_contacts_org_cnpj') is null then
    create trigger contatos_cnpj_unico
      before insert or update of custom_fields, organization_id, is_merged_into on public.contacts
      for each row execute function public.fn_guardar_cnpj_unico_do_contato();
  else
    drop index if exists public.idx_contacts_org_cnpj;
  end if;
end
$$;
