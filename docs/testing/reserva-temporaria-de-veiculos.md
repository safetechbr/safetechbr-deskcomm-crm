# Reserva de visita no estoque

Destino: núcleo, extensão da operação de estoque já distribuída; nenhuma capacidade existente é removida. A reserva de visita é separada do status administrativo `reservado` (que também representa carro ainda sem preço da troca). O status base do carro permanece `disponivel`; a exclusividade é calculada pelo prazo da reserva ativa. Não há cron necessário para liberar nem risco de cron reativar um carro vendido.

## Contrato

Central → painel direito → Estoque → Reservar para visita. Prazo inteiro entre 1 e 24 horas, padrão 24. Horário de visita opcional, dentro do prazo. Vendedor é a identidade autenticada, nunca um ID recebido do formulário. Adquirir bloqueia a linha do veículo e o registro aberto; duas requisições não ganham. Repetição do dono não renova prazo. Liberação exige ID da reserva que a tela viu (não libera uma reserva posterior). Dono ou gerente libera; os demais enxergam nome/prazo e envio desabilitado. Reservas vencidas não têm efeito mesmo se ainda estiverem abertas no histórico. Aquisição posterior encerra a anterior como expirada.

`reservas_de_veiculo` tem organização, vendedor FK, veículo FK, conversa FK, prazo e encerramento. RLS de leitura pela organização; sem escrita direta de authenticated. RPCs security definer com auth.uid, membership, papel e organização revalidados. Funções revogadas de PUBLIC/anon. API preserva o escopo da conversa pela sessão e exige requireSupportWrite + requireRole. Tabela adicionada à publication Realtime; painel aberto invalida consultas ao receber mudanças e refaz leitura a cada 5 segundos e ao foco. Chave da query inclui organização.

O preparo de mídia e cada mensagem conferem disponibilidade; trigger de messages também cobre fotos/vídeo preparados antes, inclusive caminho copiado sem metadata. O handler relê junto ao corte de envio. Texto manual arbitrário colado fora da ficha não pode ser identificado como oferta de um carro; a proteção é para o fluxo estruturado do estoque e suas mídias identificáveis. A IA exclui reservas ativas da consulta e do preparo por código. O trigger em veiculos protege conclusão do PDV e alterações de disponibilidade; venda do dono encerra a reserva como vendida. Vendas e reservas serializam na mesma linha. Erro de leitura de reservas não é tratado como estoque livre.

## Verificação

- Banco descartável, baseline install + update sem erros: 11 invariantes de reserva passaram (disputa simultânea, idempotência, limite 24h, viewer, outra organização, bloqueio de escrita direta, liberação, prazo expirado, status administrativo/vendido, venda pela RPC real do PDV e mensagens de texto/foto/vídeo, com controle negativo do gatilho).
- Unitários: regra de prazo/dono, IA exclui reserva, painel distingue dono/colega, permite reservar com padrão 24h. Regressões de fotos do agente preservadas.
- Navegador autenticado no desenvolvimento: conversa do próprio número de teste, reserva real de 24h pelo painel direito, nome/prazo exibidos, liberação pelo mesmo botão devolveu a opção Reservar para visita. Nenhuma mensagem ou venda foi enviada/concluída. Evidência em `evidence/reserva-de-veiculo/`.
- O bloqueio de outro vendedor foi exercitado no componente e no PostgreSQL com duas identidades; não foi simulada uma segunda sessão autenticada no navegador.

## Living System Checklist

Entrada: EstoqueDaConversa na conversa ativa. Saída: API de veículos, preparo/mensagens, consulta da IA e conclusão do PDV. Registro: reservas_de_veiculo com encerramento e audit veiculo.reservado/veiculo.reserva_liberada. Tela/porta: central e lista de estoque já existentes. Anti-morte: vencimento obrigatório em até 24h independente de cron. Configuração: diálogo com prazo e visita, ações de liberar/erro visível. Continuidade: equipe vê o bloqueio; IA exclui o reservado. Retorno: conflito recarrega o estoque, erro não assume disponibilidade, liberação corrige reserva desnecessária sem apagar histórico. Mapa: docs/architecture/reserva-de-veiculo.architecture.json.

## Fechamento da entrega

385 testes unitários/arquiteturais passaram em 9 arquivos; 22 casos de banco passaram em 3 arquivos (reserva, permissões de definers e regressão de crediário). Typecheck passou. ESLint dos arquivos novos e alterados desta entrega passou sem erros; a tela de estoque já tinha aviso de setState em efeito da categoria, fora desta entrega. O registro de definers foi completado com call sites reais das RPCs de reserva e das RPCs existentes do PDV medidas nesta integração; nenhum privilégio anterior foi ampliado.

A migration 9036 foi aplicada somente ao banco de desenvolvimento. A tentativa de aplicação em produção foi rejeitada pela revisão automática por falta de autorização explícita para criar tabela/funções/gatilhos/publication no banco ativo. Produção permanece em prod-20261109-2022-cadastro-cliente, sem migration 9036. Patch isolado em /private/tmp/reserva-veiculo.patch, dry-run aprovado sobre a versão ativa. O preparo de fotos de veículos da IA existe apenas no trabalho local paralelo, por isso o patch de produção preserva esse arquivo; a consulta de estoque da produção também passa a excluir reservas quando esta entrega for publicada.

O navegador real foi exercitado no desenvolvimento com seus dados existentes; não foi executado E2E contra instalação fresca completa com WAHA/Redis. A instalação e atualização do baseline foram testadas no PostgreSQL descartável. A reserva criada no teste foi liberada pela interface e nenhum veículo ficou retido por esta validação.
