# Estoque no atendimento do agente

O Atendente SDR v2 de produção tinha `crm_search_products`, que consulta `catalog_products` (zero linhas), e um prompt genérico de uma frase. O estoque novo usa `veiculos` e tinha dois disponíveis. No Testar, a pergunta sobre Logan retornou que o modelo não foi encontrado, embora ele exista no estoque. Diagnóstico por configuração, contagens da própria empresa e teste sem envio de WhatsApp; nenhuma conversa de terceiro foi lida para diagnosticar.

## Contrato

A opção **Consultar estoque e preços** aparece no seletor de capacidades de AgentForm/ToolPicker, inclusive na criação, e nos pacotes vender/atender. O registro real `crm_consultar_estoque` é de leitura, com papel agent e escopo mcp:read. A opção precisa integrar a versão escolhida do agente; versões publicadas são snapshots e não ganham capacidades silenciosamente.

O handler lê `veiculos` com organização confiável e status disponível. Pagina em ordem de ID, respeita páginas menores do servidor e sinaliza varredura incompleta. Só colunas comerciais: sem placas, custo de compra, arquivos privados, credenciais ou dados de clientes. Marca, modelo, faixa em centavos, moeda, ano, km, câmbio, combustível e cor são filtros conjuntos. Intervalos invertidos são recusados. Não há escrita, reserva, venda, envio de fotos ou mensagem nesta capacidade.

A visão geral resume todos os itens encontrados, com facetas limitadas e faixas por moeda, sem entregar o estoque bruto ao modelo. Sem direção ou com mais candidatos que o limite, a resposta pede refinamento e não devolve opções. O limite máximo é três. Um preço pendente não vira zero; faixas de moedas diferentes exigem confirmação. Sem resultado, o agente deve negociar qual critério o cliente aceita mudar, nunca relaxar modelo, orçamento ou ano silenciosamente.

`buildMcpTurnTools` monta a escolha persistida pelo mesmo registro do runtime. `SCENARIO_READS` permite a consulta no Testar sem dados de cliente. O retorno comercial usa códigos `veiculo:<codigo>` para não colidir com produtos antigos e é registrado em `evidenciasComerciais.registrarCatalogo` no turno antes das verificações de oferta. Não reutiliza fotos de `catalog_products`.

## Configuração e limites

Em um agente existente, preparar rascunho a partir da publicada, marcar a nova capacidade e orientar perguntas progressivas. Para o SDR desta empresa, substituir a busca do catálogo antigo vazio pela busca do estoque; preservar todas as outras capacidades, modelo, credencial e canal. Texto proposto e motivos em `docs/testing/prompts/atendente-sdr-estoque-v3.md`.

A nova leitura fez o menor segundo pacote exigir 28 capacidades, contra 27. O gate de combinação de pacotes reprovou com 27; o teto passou ao mínimo medido de 28. Nenhuma guarda de capacidade crítica foi afrouxada.

Destino: núcleo deste fork de loja de veículos, pois o estoque já integra a operação comum, sem módulo externo nem novo schema. Nenhuma migration, variável de ambiente ou cadastro duplicado.

## Verificação

Os testes cobrem criação/edição, seleção sem perder capacidades, resumo amplo, orçamento e filtros combinados, limite de três, zero resultados sem relaxamento, preço pendente, moedas, paginação, corte explícito, erros e defesa contra retorno de outra organização. Remover o filtro de organização do handler fez a regressão de escopo falhar; o arquivo foi restaurado antes dos testes seguintes.

TypeScript e ESLint dos arquivos novos passaram. Os testes de catálogo, pacotes, cenário, evidências, seletor e arquitetura passaram. O banco efêmero instalou e reaplicou o baseline, passou no gate do kit e em quatro invariantes de isolamento/ausência de permissão de escrita; os dados foram sintéticos e o container foi removido.

Prova direta na VPS, com o handler compilado a partir desta implementação e o estoque real em modo leitura, em `estoque-prova-real.json` temporário:

| Caso | Resultado |
| --- | --- |
| Visão geral | Dois disponíveis, resumo e pedido de refinamento, nenhuma oferta |
| Logan | Um compatível, R$ 57.900,00 |
| Amarok | Uma compatível, R$ 123.900,00 |
| Até R$ 50 mil | Nenhum compatível |
| Logan até R$ 1 mil | Nenhum compatível |
| Logan a partir de 2050 | Nenhum compatível |

A prova pelo Testar e a consulta direta devem ser comparadas com as mesmas entradas da ferramenta, sem corrigir os filtros do modelo em silêncio. O texto completo das mensagens de cenário e os resultados antes/depois devem ser preservados como evidência. O Testar é dry-run e não comprova um envio de WhatsApp. A produção limita a resposta ao número de teste e à janela de horário já configurada; esses parâmetros não são modificados por esta integração.

## Living System Checklist

1. Entrada: escolha no ToolPicker e filtros derivados da solicitação real do cliente.
2. Saída: resumo/seleção para o Conversador e evidências comerciais do turno.
3. Registro: ponte MCP existente audita invocação, motivo do vazio e tamanho do resultado em api_audit_log.
4. Tela: capacidade no editor, chamadas/resultado no Testar e painel Capacidades do agente.
5. Porta: Agente de IA → Agentes → criação/edição → capacidades; teste na aba Teste.
6. Anti-morte: ausência/erro têm orientação explícita para ajustar critérios ou confirmar com a equipe, sem inventar estoque.
7. Configuração: capacidade marcada por versão, prompt no rascunho e estoque no cadastro existente.
8. Continuidade: consulta não assume atendimento, não transfere responsável, não vende nem envia; preserva os fluxos IA/humano existentes.
9. Retorno: vazio declarado alimenta métricas da capacidade; no próprio diálogo, a orientação solicita critério faltante e nova consulta, fechando o refinamento.
10. Mapa: docs/architecture/estoque-no-atendimento.architecture.json liga editor, versão, consulta, estoque, evidências, atendimento e auditoria.

## Resultado em produção

Release `prod-20261108-2230-estoque-agente` publicada com sucesso sobre `prod-20261108-2202-nome-contato`, somente com o patch desta integração. A capacidade foi conferida e marcada pela interface no rascunho v3 do Atendente SDR; a consulta ao catálogo antigo vazio foi desmarcada. A publicada permanece v2, com modelo/credencial/canal preservados. O clique final Publicar fica com a pessoa por instrução explícita de `.agents/skills/deskcomm-prompt/SKILL.md`.

Foram preservadas três respostas anteriores ao rascunho (Logan, Amarok e pedido amplo) e cinco testes do rascunho, todos pelo Testar sem envio a clientes. A coleta anterior foi interrompida quando a aba foi trocada; não se afirma uma comparação anterior completa dos cinco cenários. Evidência textual em `docs/testing/estoque-agente-comparacao.json`.

Na v2, Logan foi declarado ausente do catálogo e Amarok dependia de confirmação da equipe. Na v3: Logan respondeu R$ 57.900, ano e km do cadastro; Amarok respondeu R$ 123.900, ano/câmbio/km; pedido amplo perguntou orçamento sem enumerar o estoque; Logan até R$ 50 mil e Amarok automática até R$ 120 mil retornaram ausência compatível e pediram autorização para ajustar critérios. Os argumentos efetivamente auditados da nova consulta foram repetidos sem reescrita diretamente na VPS, concordando com os retornos do agente (artefato temporário `/private/tmp/estoque-prova-em-par.json`). O último cenário de orçamento também foi conferido na tela.

A suíte selecionada passou com 599 testes em nove arquivos, mais quatro invariantes no Postgres efêmero. TypeScript passou; ESLint dos arquivos novos/alterados deste fluxo passou, com dois avisos preexistentes em inbound-turn na conferência inicial. A suíte E2E completa continua dependente de `.env.e2e` ausente; a prova de interface foi feita na sessão real autenticada.

Capturas: `/private/tmp/estoque-agente-preco-real.jpg` e `/private/tmp/estoque-agente-rascunho.jpg`.
