# Validação do contrato

Dados exclusivamente sintéticos; a identidade das pessoas e da loja do PDF de referência não foi copiada.

- 21 testes unitários passaram: edição e bloqueio dos campos, snapshot independente, validação do modelo e regressões de crediário/cadastro de cliente/manifest.
- 11 invariantes de banco passaram: conclusão de compra e troca, preservação do cadastro do carro vendido, isolamento real de outra organização com registros, viewer sem escrita e constraints dos campos novos; regressões de crediário.
- Baseline instalado e reaplicado com ON_ERROR_STOP no Postgres 15 descartável. A conferência externa da última release ficou indisponível na primeira tentativa; a execução concluída usou `CONFERENCIA_KIT_RELEASE=v1.104.0` já disponível localmente.
- Migração aplicada somente no desenvolvimento: zero das quatro novas colunas antes, quatro depois. Produção não foi alterada.
- Tipos gerados do desenvolvimento; incorporados os dois cadastros de veículos/negociações e o campo novo da organização.
- PDF com três páginas A4. Renderização final conferida pelo PDFKit nativo; total R$ 80.000,00, troca líquida R$ 15.000,00, financiamento R$ 60.000,00 e PIX R$ 5.000,00. As informações atuais da loja passadas ao gerador não substituem a fotografia.
- Typecheck passou. Lint sem erros; os avisos existentes no efeito de sugestão de categoria e no import de tipo da reserva foram preservados.
- Fluxo manual autenticado conferido no localhost: empresa/estoque editáveis (sem salvar alterações nos cadastros reais), rascunho sintético de compra #0002 criado e editado, recarregado e reaberto pelo histórico. Condição e pendência preservadas. Prévia baixada pelo controle da tela e texto verificado: 3 páginas, empresa exclusiva do rascunho, vendedor de teste, cláusula especial e débito R$ 123,45. Capturas `empresa.png`, `estoque.png` e `pdv-rascunho.png`. Sem overflow horizontal no PDV na largura de 712px (conteúdo = 712px).
- Encontrado 500 no POST por falta da coluna `modalidade` no desenvolvimento. Aplicada a migração existente `20261108141046_crediario_pdv.sql` somente no desenvolvimento; POST passou a retornar 201 e PATCH 200. Produção não alterada.
- Cancelamento do rascunho sintético solicitado pela tela ao final; confirmação pendente de intervenção do usuário por bloqueio do navegador na caixa de confirmação. Nenhuma compra concluída.
- Não corresponde a PASS Playwright em instalação fresca: a prova visual manual usou o ambiente de desenvolvimento autenticado.
