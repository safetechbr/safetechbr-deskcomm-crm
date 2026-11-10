# Cadastro manual completa o contato do atendimento

Destino: núcleo; os cadastros manuais de cliente e contato fazem parte da operação comum. Não há segunda tabela de clientes nem schema novo.

As três portas — PDV, Clientes → Novo e NewContactDialog — enviam `reuse_existing_phone: true`. O POST de contatos continua estrito para integrações que não optaram pelo reaproveitamento. A associação exige ator humano, origem manual, mesma organização, contato person vivo e único nas variantes de telefone. Anonimização, ambiguidade e CPF divergente recusam a associação. Um tipo explícito divergente também é recusado. Nunca junta registros nem procura por nomes parecidos.

`atualizarCadastroManual` utiliza `patchContactHandler`, preservando validação, cifra do CPF, índice único de e-mail/CPF, auditoria e evento de atualização existentes. Apenas nome, e-mail, nascimento e CPF informados são atualizados; etiquetas informadas são acrescentadas sem apagar antigas. Telefone não é regravado só para trocar a grafia, e identidade, origem, consentimentos, bloqueios e vínculos ficam intactos. Falha de leitura não é interpretada como contato ausente. O conflito de insert concorrente é relido para reaproveitar o contato recém-criado.

O nome do cadastro já vence agenda e perfil em `rotuloParaAEquipe`. Os mutations invalidam contato, lista e detalhe de conversa. A lista da central também assina UPDATE de contacts por organização; entregas dependem da publication Realtime da instalação, com as redes de refetch existentes mantidas. Outros canais só acompanham quando a conversa está vinculada à mesma identidade; não é criada fusão automática de perfis sem telefone/vínculo confirmado.

Checklist de sistema vivo: entrada = formulários manuais e telefone validado pelo país; saída = contato original e seleção do mesmo ID na venda; registro = contact.updated e auditoria do patch existente; tela = cadastro, clientes e central; porta = três formulários existentes; anti-morte = erro explícito em ambiguidade/documento, sem perder o formulário; configuração = intenção manual no corpo validado; continuidade = mantém responsáveis e conversas IA/humano; retorno = sucesso seleciona o contato atualizado e invalida caches, erro preserva dados digitados; mapa = reutiliza o fluxo existente contacts/central, sem nova tela ou tabela.

## Validação em 09/11/2026

359 testes passaram em 9 arquivos (helper, ramo real do handler, corrida de insert, PDV, duplicidade legada, CPF/e-mail, inbox e mapas). ESLint dos arquivos alterados e `tsc --noEmit -p tsconfig.typecheck.json` passaram.

Publicação isolada `prod-20261109-2022-cadastro-cliente`, sobre `prod-20261108-2321`, concluída com status 0. Login HTTP 200 e área protegida HTTP 307 sem sessão; app/worker ativos e scheduler saudável. Nenhuma migration necessária.

Prova pelo navegador autenticado em produção: PDV → Cadastrar cliente → nome Jeiel e telefone do número de teste já existente → Salvar cliente. Toast “Cadastro do cliente salvo.” e cliente selecionado no PDV. Leitura antes/depois confirmou um único contato nas variantes de telefone, mesmo ID e mesma conversa vinculada; o nome antes vazio passou a Jeiel. Central de conversas confirmou Jeiel na lista. Não houve finalização de venda nem envio de mensagem. Captura: `/private/tmp/cadastro-cliente-existente-pdv.jpg`.
