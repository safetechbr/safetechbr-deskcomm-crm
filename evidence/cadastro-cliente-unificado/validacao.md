# Cadastro único do cliente no PDV

Conferência manual autenticada no localhost, com contato sintético claramente identificado como teste, sem telefone ou e-mail e sem concluir negociação.

- O modal existente de cadastro recebeu o campo Nacionalidade.
- Cadastro com razão social, CNPJ, nacionalidade, RG, CNH e endereço foi salvo pela tela (POST 201).
- Editar cadastro reabriu os campos preenchidos no mesmo modal; RG foi atualizado pelo PATCH do mesmo contato.
- Outra aba abriu o PDV do zero e pesquisou o cliente pelo nome: CNPJ, nacionalidade, RG editado, CNH, rua, número, cidade e UF retornaram do cadastro.
- Modal de endereço medido: 576 × 426 px e contido na viewport.
- Dados do contrato expandido: zero ocorrências de Cliente no contrato. Captura em sem-formulario-duplicado.png.
- Evidências dados-cadastrais.png e endereco.png mostram somente valores fictícios do cadastro de teste.
- 30 testes unitários passaram, incluindo modal, transporte POST/PATCH, preenchimento da negociação, CNPJ, CPF protegido, complemento de contato prévio e preservação de campos do CRM.
- 11 testes de banco passaram em Postgres temporário, incluindo proteção/anonimização de custom_fields e regressões do contrato.
- Typecheck e lint dos arquivos alterados sem erros. Sem nova migração: os complementos usam o custom_fields já existente e protegido do mesmo contato.

A conferência manual no desenvolvimento não substitui o E2E Playwright em instalação completa fresca.
