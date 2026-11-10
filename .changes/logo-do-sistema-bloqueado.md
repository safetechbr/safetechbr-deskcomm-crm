---
impacto: nada_mudou
secao: alterado
titulo: Logo do sistema bloqueado para troca pelas empresas
---

As empresas não trocam mais o logo: todas veem o logo da instalação. A trava vem ligada por padrão e só o administrador da plataforma a desliga, em /admin/marca. Com ela ligada, a rota de upload recusa com 403, o layout ignora logos antigos das empresas e a tela de marca da empresa mostra um aviso no lugar do envio. Migração 9035 (`platform_branding.logo_bloqueado`).
