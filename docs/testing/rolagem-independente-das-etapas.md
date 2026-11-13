# Rolagem independente das etapas

KanbanBoard é compartilhado pela central (FunilNaCentral) e pelas páginas de funil. O quadro limita a altura e mantém navegação horizontal; StageColumn fixa cabeçalho fora da lista e dá min-height zero e overflow vertical à área Droppable. Cards não encolhem para caber. A lista é região nomeada, focável e aceita PageDown, com contenção de overscroll vertical.

Prova em navegador local autenticado: na central, lista Novo com 345px de altura e 2.984px de conteúdo rolou 325px; outras três listas e quadro mantiveram scrollTop zero. Cabeçalhos ficaram no mesmo topo de 276px. Na página do funil, a lista com 432px de altura rolou 399px, vizinhas e quadro continuaram em zero. Nenhum card foi movido ou alterado. Capturas em evidence/funil-rolagem-independente/.

35 testes de regressão de controles de cards/etapas passaram, typecheck passou e lint dos arquivos tocados terminou sem erros (avisos preexistentes sobre dependências de hooks no KanbanBoard). As specs geométricas existentes foram atualizadas ao novo contrato; não foram executadas contra instalação E2E fresca. O arraste e sua rolagem automática entre áreas roláveis não foram exercitados nesta verificação.
