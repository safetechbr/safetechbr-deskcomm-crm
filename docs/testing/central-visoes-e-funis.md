# Central: visões e funil principal

`A fazer` abre a Fila de atendimento humano existente e oferece Minhas (sem fechadas/arquivadas). `Conversas` reúne o histórico autorizado, Automático, Fechadas e Arquivadas. Vendedor restrito lê Do meu acesso; a RLS existente continua no comando.

`Funil principal` monta `FunilNaCentral` na própria área de trabalho, reaproveitando `useBoard`, `KanbanBoard`, filtros, criação de negócio e ações em lote existentes. O menu Outros funis troca o quadro nessa área. Gerenciar funis leva à lista existente, na mesma aba. Não há iframe ou janela externa para consultar os quadros.

A URL usa `visao=funil` e, para outro quadro, `funil=<id>`, preservando `filter`, `id` e etiquetas. A lista, conversa e composer ficam montados e ocultos ao abrir o funil; o rascunho permanece. Os atalhos do Inbox são desmontados enquanto o quadro está visível, impedindo assumir/fechar uma conversa oculta pelo teclado. Filtros do quadro são independentes dos filtros da conversa. No celular, os filtros do quadro podem ser expandidos por um botão.

## Configuração

Gestores podem escolher um quadro em Outros funis e clicar Definir como principal. A preferência é da empresa, salva em `organizations.settings.central.pipeline_id`, independente de `crm_pipelines.is_default`. Nenhum schema novo. Sem preferência válida, usa o funil padrão vivo (ou primeiro vivo); se o escolhido foi arquivado/excluído, informa a substituição. Sem nenhum funil, oferece Gerenciar funis. Falhas de leitura têm Tentar de novo.

`GET /api/v1/settings/central` exige agent e faz leituras no cliente de sessão com organização explícita. `PATCH` exige manager, bloqueia suporte de leitura, valida UUID/corpo estrito e verifica o funil vivo da mesma organização. A escrita administrativa limita o ID à sessão, usa CAS sobre settings e confere a linha retornada antes de auditar. Concorrência devolve 409 sem sobrescrever configuração nem auditar sucesso. O evento `settings.central_pipeline_updated` aparece em `/app/audit`.

## Verificação

- 96 testes passaram em 12 arquivos, incluindo rota da preferência, navegação, quadro embutido, escopo dos filtros, permanência da lista, desativação de atalhos ocultos e guarda de suporte.
- Outros 293 testes de mapas de arquitetura e derivação da lista de auditoria passaram.
- Typecheck passou. ESLint sem erros, com os dois avisos preexistentes de efeitos em InboxLayout.
- Conferência manual no navegador local autenticado: desktop e 390 × 844, transição na mesma central, quadro com cartões reais e preservação de um rascunho de conferência ao ir/voltar. O texto de teste foi apagado e nenhuma mensagem enviada.
- A gravação da preferência foi exercitada com dublês da API/banco (permissões, organização, CAS, falhas e auditoria); a configuração real da empresa não foi alterada para testar.
- O gate de banco passou: instalação e reaplicação do baseline, conferência do kit local/histórico e seis invariantes de escopo do Inbox em Postgres efêmero. Para o fork, a release v1.104.0 foi conferida no GitHub e as tags v1.104.0/v1.63.0 foram buscadas do projeto original; os containers temporários foram removidos pelo harness.
- Playwright completo permanece dependente de `.env.e2e`, ausente neste checkout; nenhuma fixture foi semeada no banco remoto.

## Living System Checklist

1. Entrada: URL, contexto da organização, menu e preferência da central.
2. Saída: InboxFilters/useConversationsRealtime e FunilNaCentral/useBoard/KanbanBoard.
3. Registro: PATCH emite settings.central_pipeline_updated; navegação de leitura não cria atividade.
4. Tela: cabeçalho de InboxLayout e quadro na mesma central; evento em /app/audit.
5. Porta: Central de conversas existente, terceira aba e menu Outros funis.
6. Anti-morte: sem demanda nova; mantém filas e próximo passo existentes. Funil indisponível tem reserva explícita e leitura com falha oferece nova tentativa.
7. Configuração: Definir como principal para manager+, preferência da organização, independente das novas entradas.
8. IA/humano: preserva comando e filas; alternar não assume, encerra ou transfere atendimento.
9. Retorno: escrita só atualiza a preferência depois do sucesso; falha informa o erro e mantém o quadro escolhido, permitindo tentar novamente.
10. Mapa: docs/architecture/central-visoes-e-funis.architecture.json liga central, consultas, preferência, quadros e auditoria.

## Identificação e troca em CRM → Funis

`FunisClient` lê o mesmo `useFunilPrincipalDaCentral` da central e mostra a tag Principal da central no quadro efetivamente usado. O selo Padrão permanece separado, pois representa o funil de novas entradas. Gestores usam Definir como principal da central na própria linha, inclusive depois de criar outro funil. A preferência só muda no cache compartilhado depois da resposta bem-sucedida; erro mantém a tag anterior e mostra a recusa na linha. A página bloqueia o novo controle para suporte somente leitura.

O evento já existente `EVENTO_FUNIS_MUDARAM` invalida a leitura da preferência depois de criar, renomear, arquivar, restaurar ou mudar o padrão. Vários consumidores não cancelam e reiniciam a mesma releitura (`cancelRefetch: false`). Não há novo endpoint, schema ou permissão.

A entrada adicional do Living System Checklist é CRM → Funis; seu consumidor e registro são a mesma central e settings.central_pipeline_updated já descritos acima. O mapa agora inclui a lista do CRM com arestas de leitura e gravação da preferência.

Validação desta ampliação: sete casos de integração com o cache real do React Query cobrem identificação independente de Padrão, criação seguida de troca, consumidor da central atualizado, recusa de gravação, vendedor sem gestão, suporte de leitura e atualização após mudar os funis. As regressões da lista/arquivo e central passaram, assim como o mapa, TypeScript e ESLint dos arquivos alterados. Conferência visual autenticada em desktop, 900 px e 390 px, sem transbordamento horizontal; a configuração real da empresa não foi alterada como fixture de teste. A suíte E2E completa continua dependendo de `.env.e2e`, ausente neste checkout.

## Regressão: chaves duplicadas ao alternar o funil

`NavegacaoDaCentral` e `FunilNaCentral` eram irmãos diretos com `key={orgId}`. O React avisava de chave duplicada e podia deixar duas navegações após alternar as visões. As chaves agora são `navegacao:${orgId}` e `funil:${orgId}`: distintas entre irmãos, estáveis entre renders e ainda diferentes ao trocar de empresa.

O novo caso em `inbox-filtros-lembrados-no-contexto.test.tsx` alterna funil/conversas e empresas A/B/A, confere uma única navegação/quadro e a ausência desse erro no console. Antes da correção, falhou encontrando duas abas Funil principal; depois, os 45 testes relacionados e o typecheck passaram. A alteração preserva as entradas/saídas e o checklist da central descritos acima; não muda dados, permissões nem ações de negócio.

No navegador autenticado, a alternância Conversas → Funil principal foi repetida duas vezes após a correção: nenhuma nova mensagem de chave duplicada no console, uma única aba Funil principal e um único quadro renderizado. Evidência local: `/private/tmp/central-chaves-corrigidas.jpg`. ESLint sem erros, mantendo os dois avisos preexistentes de efeitos em InboxLayout.

## Configurar colunas de funis existentes

O editor de etapas já existia em CRM → Ver tudo em CRM → Etapas do funil. Agora `ConfigurarColunasLink` dá acesso pela linha do funil, pelo cabeçalho do quadro completo e pelo cabeçalho do quadro na central. Os três usam a mesma âncora exportada de `lib/kanban/links-de-configuracao.ts`, consumida também por `StagesSection`. O editor mantém o nome do funil à vista ao abrir pela âncora e apresenta Acrescentar etapa ao fim antes da lista de colunas.

Não foi criado outro CRUD. `useStages` continua usando as rotas de etapas existentes e agora invalida também `chaveDoQuadro(pipelineId)`, preservando o cache dos outros funis. Isso evita voltar ao quadro antes dos 30 segundos de cache e encontrar as colunas antigas. O teste de criação prepara um quadro fresco no cache e verifica essa invalidação específica, além da releitura do editor.

A criação, renomeação, ordenação e o arquivamento são manager+. Arquivar remove a coluna do quadro e preserva o histórico; a operação existente exige destino para os negócios quando necessário e mantém as regras de fechamento/perda. Nenhuma alteração de banco, regra ou permissão nesta ampliação.

Living System Checklist: entrada = contexto de funil nos três atalhos; saída = StagesSection e rotas de etapas; registro = auditoria existente das operações (atalho de leitura não emite atividade); tela/porta = lista, quadro e central; anti-morte = reaproveita a transferência de negócios ao arquivar; configuração = editor existente, com ação de criação visível no início; continuidade IA/humano = mantém o mapeamento e as guardas já presentes no editor; retorno = erros existentes preservados e releitura do editor/quadro; mapa = novas arestas em central-visoes-e-funis.architecture.json.

Validação dos atalhos de colunas: 101 testes em seis arquivos passaram (editor de etapas, quadro completo, central, lista, permissões e cache), além de 288 verificações do mapa. Typecheck e ESLint dos arquivos alterados passaram. No navegador autenticado, o atalho do funil Vendas abriu sua seção de etapas, com Acrescentar etapa ao fim antes das linhas e Arquivar em cada coluna. O formulário de criação foi aberto e cancelado sem gravar; nenhuma etapa da empresa foi alterada como teste. Evidência local: `/private/tmp/configurar-colunas-do-funil.jpg`. A suíte E2E completa continua dependendo do ambiente `.env.e2e` ausente.
