# Crediário do PDV — entrega e ativação

Destino: núcleo. A venda continua em negociacoes_de_veiculo e cada parcela ocupa um financial_entries. Nenhuma tabela paralela de recebimento é criada.

## Fluxo

Pagamento do PDV → modalidade Crediário → principal restante após entradas e troca, quantidade mensal, primeiro vencimento, conta financeira e juros opcionais sobre o saldo. O fechamento da negociação gera as parcelas na mesma transação que conclui a venda. A diferença de centavos é distribuída pelas primeiras parcelas, preservando o total. Os meses são calculados a partir do primeiro vencimento, com ajuste ao fim de mês sem deslocar os meses seguintes.

Vendas → Crediários → Pendentes / Vencidos / Finalizados. Os recebimentos são integrais por parcela e idempotentes. Só gerente+ edita ou recalcula; atendente+ recebe. Recalcular aplica juros apenas sobre o saldo pendente e preserva as linhas já pagas. A empresa da sessão é conferida na rota e na função de banco.

A reserva desta entrega é uma negociação em aberto; não bloqueia o veículo no estoque. Cupons foram adiados por decisão do usuário.

## Validação

- 7 testes unitários de centavos, validação de operações e cadastro de cliente passaram.
- 6 invariantes em PostgreSQL descartável passaram: calendário, permissões, pagamento repetido, preservação de pagas, juros e isolamento entre empresas.
- Baseline instalado e reaplicado sem erro no PostgreSQL temporário.
- A checagem adicional do instalador contra releases externas ficou indisponível por falha de consulta da release. Foi usado harness local explicitamente limitado à instalação/reaplicação do baseline e aos invariantes. Não é uma execução completa do gate de distribuição.
- Typecheck completo sem erros; lint do fluxo sem erros (há aviso de efeito React na carga da lista).
- Inspeção visual do formulário e da opção Crediário no navegador.
- Não foi criada nem recebida venda real.

## Ativação pendente

A revisão automática recusou aplicar SQL no banco configurado por falta de autorização explícita para alterar esse banco compartilhado. É necessário aprovar as migrações 9032 e 20261108141046 antes de usar o novo fluxo com dados reais. O banco não foi alterado.

## Checklist Sistema Vivo

Entrada: venda autenticada do PDV. Saída: lançamentos financeiros e lista de crediários. Registro: negociacao_veiculo.concluded e negociacao_veiculo.crediario_updated no catálogo de auditoria. Porta: menu Vendas. Acompanhamento: abas de pendentes e vencidos e botão Atualizar. Configuração: parcela, vencimento, juros e conta no PDV; recálculo/edição no diálogo. Continuidade IA/humano: sem autonomia de IA nova. Retorno: recusa de parcela paga, validação do formulário e atualização da lista após operação. Mapa: docs/architecture/pdv-crediario.architecture.json.
