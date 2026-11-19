-- manifest: Perfil ganha upload de foto: bucket PRIVADO `user-avatars` (512 KB, png/jpeg), escrito e lido só pelo service role na rota `/api/v1/me/avatar`.
-- Privado, e não público como `brand-logos`: a foto é de rosto (dado pessoal) e
-- só aparece para quem tem sessão; a rota serve a própria foto de quem pede.
-- Caminho `<user_id>/<uuid v4>.<png|jpg>`, gerado no servidor. ZERO policy em
-- `storage.objects` para este bucket: nada passa pelo PostgREST/Storage direto.
-- `allowed_mime_types` é backstop; quem decide o tipo é o farejador de bytes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-avatars', 'user-avatars', false, 524288, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
