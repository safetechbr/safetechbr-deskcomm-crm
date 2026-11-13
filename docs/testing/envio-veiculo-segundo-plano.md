# Envio de veículos em segundo plano

Destino: núcleo. Melhora o envio manual do estoque já disponível na Central.

A confirmação em `EstoqueDaConversa` captura veículo, modo, texto revisado, vídeo e conversa. A revisão fecha imediatamente. O hook `useEnvioDeVeiculo` mantém a tarefa na MutationCache do cliente de queries, independente da montagem do cartão: recolher o estoque ou trocar de conversa não cancela o envio nem altera o destino.

Cada conversa/organização tem uma fila serial. Outro veículo pode entrar na fila; a mesma ficha/veículo não pode entrar novamente enquanto estiver pendente, inclusive após desmontar e reabrir o painel. Conversas distintas têm filas independentes. Preparação e cada mensagem continuam usando as portas existentes, incluindo disponibilidade/reservas e regras do canal. Mantém a pausa de 1,5 segundo entre itens, a ordem das mídias e a ficha ao final.

A notificação mostra espera, preparação e progresso por item; a conclusão só aparece após todas as chamadas serem aceitas pelo caminho normal de mensagens. Em falha, interrompe o lote e orienta conferir o histórico antes de reenviar. Não retenta automaticamente um lote parcialmente enviado. O resultado continua sujeito aos estados de entrega já exibidos nas mensagens. Fotos ausentes continuam gerando aviso. A fila é em memória nesta aba: recarregar/fechar a página ou sair do sistema não oferece garantia de conclusão dos itens ainda não enviados. Não há persistência local de conversas nem novo worker de servidor.

Entrada: Enviar no estoque e confirmar a ficha. Saída: mensagens no histórico e notificações globais. Observabilidade: andamento/conclusão/erro no toast, mensagens existentes e auditoria `veiculo.presented` da preparação. Antimorte/retorno: erro interrompe sem duplicação automática e aponta o histórico; clique repetido encontra a tarefa pendente; uma nova montagem acompanha a mesma tarefa.

Prova automatizada: `components/inbox/EstoqueDaConversa.test.tsx` confirma que a revisão fecha antes de resolver a preparação, preserva o texto aprovado e mantém envio/estado ao recolher e remontar. `hooks/inbox/useEnvioDeVeiculo.test.tsx` cobre desmontagem/troca de conversa sem mudar o destino, duplicidade após remontar, fila serial, ordem e conclusão de mídias/ficha, erro e ausência de repetição automática. Chamadas de envio são simuladas; nenhuma mensagem real é enviada. Controle: retirar o fechamento imediato faz o teste de revisão falhar; restaurar devolve o resultado correto.

Conferência visual pendente: o conector do navegador retornou `native pipe path unavailable`. Não foi feita medição de latência de entrega no canal real.
