-- manifest: Segurança lista as sessões ativas da própria pessoa (aparelho, IP, última atividade, qual é a atual) e encerra uma por vez; a sessão atual não se encerra por aqui (para isso existe "Sair").
-- `auth.sessions` não é exposta pelo PostgREST, então as duas são `security definer`
-- e o filtro é SEMPRE `user_id = auth.uid()` no corpo — nunca um argumento.
-- Encerrar = apagar a linha de `auth.sessions`; os refresh tokens caem junto
-- (FK cascade do Auth). Limite declarado: o access token já emitido segue válido
-- até expirar (1 h por padrão); o aparelho só cai na próxima renovação.
create or replace function public.fn_minhas_sessoes()
returns table (id uuid, user_agent text, ip text, criada_em timestamptz, ultima_atividade timestamptz, atual boolean)
language sql stable security definer set search_path = '' as $f$
 select s.id, s.user_agent, host(s.ip), s.created_at,
  coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at),
  s.id = nullif(auth.jwt()->>'session_id','')::uuid
 from auth.sessions s
 where s.user_id = auth.uid() and (s.not_after is null or s.not_after > now())
 order by 5 desc nulls last;
$f$;
revoke all on function public.fn_minhas_sessoes() from public, anon;
grant execute on function public.fn_minhas_sessoes() to authenticated;

create or replace function public.fn_encerrar_minha_sessao(p_sessao uuid)
returns boolean language plpgsql security definer set search_path = '' as $f$
begin
 if auth.uid() is null then raise exception 'nao_autenticado' using errcode = '42501'; end if;
 if p_sessao = nullif(auth.jwt()->>'session_id','')::uuid then
  raise exception 'sessao_atual' using errcode = '22023';
 end if;
 delete from auth.sessions where id = p_sessao and user_id = auth.uid();
 return found;
end $f$;
revoke all on function public.fn_encerrar_minha_sessao(uuid) from public, anon;
grant execute on function public.fn_encerrar_minha_sessao(uuid) to authenticated;
