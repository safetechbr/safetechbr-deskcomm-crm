-- manifest: Documentos privados do cliente usados como fontes do cadastro/contrato.
create table if not exists public.contact_documents (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 contact_id uuid not null references public.contacts(id) on delete cascade,
 kind text not null check (kind in ('identidade','residencia')),
 file_name text not null,
 file_size bigint not null check (file_size between 1 and 10485760),
 mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 storage_path text not null unique,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (storage_path like organization_id::text || '/contacts/' || contact_id::text || '/%')
);
create index if not exists contact_documents_contact_idx on public.contact_documents(organization_id,contact_id);
alter table public.contact_documents enable row level security;
drop policy if exists tenant_isolation_contact_documents_all on public.contact_documents;
create policy tenant_isolation_contact_documents_all on public.contact_documents to authenticated
 using (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent'))
 with check (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent') and exists (select 1 from public.contacts c where c.id=contact_id and c.organization_id=contact_documents.organization_id and not c.is_anonymized));
grant select,insert,update,delete on public.contact_documents to authenticated,service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('client-documents','client-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Sem policies de Storage: acesso somente pelo servidor após autorização do contato.

-- Remoção cadastral não deixa o original órfão; o worker existente expurga a mídia.
create or replace function public.fn_fila_documento_cliente_removido() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into public.storage_redaction_queue(organization_id,bucket,object_path)
 values(old.organization_id,'client-documents',old.storage_path)
 on conflict(bucket,object_path) do update set status='pending',attempts=0,processed_at=null,error_message=null;
 return old;
end;$$;
revoke all on function public.fn_fila_documento_cliente_removido() from public,anon,authenticated;
drop trigger if exists documento_cliente_removido on public.contact_documents;
create trigger documento_cliente_removido after delete on public.contact_documents for each row execute function public.fn_fila_documento_cliente_removido();
