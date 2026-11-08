-- manifest: Integração social em modo gerenciado: a plataforma usa a chave mestra do Zernio e cria um perfil por organização; o cliente só conecta as redes. Coluna `managed` em `channel_integrations` (false = chave própria do cliente, como antes).
alter table public.channel_integrations add column if not exists managed boolean not null default false;
