# Atendimento com vendedor responsável

Destino: núcleo. A atribuição faz parte da operação comum da Central; a senha é uma autorização específica da empresa para substituir outro vendedor, independente da senha de login.

## Uso

Na Central, o cartão Atendimento substitui o seletor de carteira. Um membro ativo com papel agent, manager ou admin assume para o próprio login com um clique. A etiqueta mostra o nome do responsável no cartão e nas linhas das conversas assumidas, inclusive quando a lista tem apenas um atendente. Abrir a conversa não altera o responsável.

O próprio responsável pode Liberar atendimento. Outro vendedor precisa da senha administrativa para assumir; administrador também usa a senha ao assumir o cliente de outro. O formulário de senha fica em Configurações → Segurança, disponível para admin. Gerar preenche uma senha aleatória; Salvar efetiva a alteração. Nenhuma senha é criada automaticamente. A anterior perde a validade quando uma nova é salva.

## Consistência e segurança

`fn_atendimento_alterar` é exclusiva do servidor; exige ator membro ativo da organização, passado pelo servidor depois do `requireRole`. A função bloqueia o contato antes das conversas, confere o responsável esperado e atualiza carteira e conversas do contato em uma transação. Não altera responsáveis de negócios que já têm dono. Conversa não visível segue recusada; assumir conversa livre preserva a exceção anterior para o modo de visibilidade própria. Dono inativo deixa de bloquear o cliente. Não há backfill de clientes nem configuração de senha padrão.

Os hashes bcrypt e os contadores não têm acesso para anon/authenticated; tabelas com RLS e escrita do serviço. A senha nunca é devolvida por GET nem gravada na auditoria. Cinco erros por usuário/empresa bloqueiam a verificação por 15 minutos. Recusa de senha é um resultado da RPC para que a tentativa seja persistida. Trocar a senha não apaga a janela de tentativas. A configuração aceita 8 caracteres ou mais, limitada a 72 bytes UTF-8.

O gatilho `trg_atendimento_proteger_atribuicao` recusa troca por UPDATE direto, RPC antigo, transferência, lote e rodízio que removam um responsável ativo sem sua liberação ou autorização. O caminho legado de carteira também recusa sobrescrever responsáveis ativos. Revogar um membro permite a limpeza dos vínculos dele. A rota nova e o claim tradicional usam o mesmo serviço; a liberação tradicional usa a mesma transação. As conversas ativas existentes recebem a identificação; conversas encerradas/arquivadas preservam seu histórico e responsável; uma nova conversa de outro canal continua protegida pela carteira, até ser assumida pelo dono ou mediante senha.

## Retorno e operação

Entrada: cartão da Central e da ficha do cliente; configuração em Segurança. Saída: `contacts.carteira_user_id`, atribuições e nomes em `conversations`, eventos de atribuição e `api_audit_log`. A lista recebe alterações pelo realtime existente; carteira é reconsultada a cada 5 segundos com a janela ativa. Conflito ou senha errada preserva o responsável, atualiza o cache e mostra uma mensagem; a senha digitada é limpa. O administrador pode trocar uma senha esquecida. Assim, a recusa volta à tela com uma ação possível, sem forçar perda de atendimento.

## Verificação

`lib/atendimento/banco.integration.test.ts` exercita a migração em transação desfeita ao final, com usuários/empresa/cliente/canais fictícios: assumir dois canais, etiqueta/nome e silêncio do bot, senha obrigatória, senha ausente/incorreta, limite e expiração, rotação da senha, liberação pelo responsável, versão esperada divergente, isolamento de empresa, papel viewer e manager, permissões das tabelas/RPCs e bloqueio dos caminhos antigos. Execute com `ATENDIMENTO_DB_TEST_URL` apontando para um Postgres de teste. Não execute contra banco sem cópia recuperável: o teste aplica DDL temporária e obtém locks, embora faça rollback integral.

Testes de componentes e rotas cobrem o clique único, etiqueta, solicitação/limpeza de senha, liberação, somente leitura e configuração restrita ao administrador. A conferência visual no navegador não pôde ser executada: o conector retornou `native pipe path unavailable`. A migração é aplicada no banco de desenvolvimento usado pelo localhost; não há deploy em produção nesta alteração.

Resultado da validação: testes de componentes/rotas/serviço, typecheck e ESLint passaram. A integração Postgres passou com dados sintéticos e rollback; desabilitar temporariamente a verificação de senha fez o teste falhar, e restaurá-la devolveu o resultado esperado. A API REST confirmou RPC disponível ao servidor, recusa para ator inexistente e acesso anônimo bloqueado. Migração aplicada no banco do localhost com contagens preservadas (45 contatos, 41 conversas e 2 carteiras), sem senha padrão. O baseline passou em instalação e reaplicação no Postgres descartável; a etapa adicional de conferência do kit interrompeu antes dos invariantes porque não conseguiu obter a última release publicada.
