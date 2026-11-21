-- manifest: Fiscal etapa 2: um rascunho vivo por negociação e operação (evita nota duplicada se o concluir rodar duas vezes) e `autorizada_em` em `documentos_fiscais`, que marca o efeito de autorização como já aplicado. Aditiva e idempotente.
alter table public.documentos_fiscais add column if not exists autorizada_em timestamptz;

create unique index if not exists documentos_fiscais_negociacao_operacao_key
  on public.documentos_fiscais (negociacao_id, operacao)
  where negociacao_id is not null and status not in ('cancelada', 'inutilizada');
