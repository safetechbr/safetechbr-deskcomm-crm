# Documentos do cliente no PDV

Destino: núcleo, complementando o cadastro existente, sem operação paralela.

No cadastro/edição do PDV, anexar CNH/identidade e comprovante de residência (foto ou PDF, até 10 MB/arquivo, até 4 páginas para leitura). A leitura local sugere dados em campos vazios. Identidade preenche nome, CPF, RG, CNH e nascimento; comprovante preenche rua, número, complemento, bairro, CEP, cidade e UF quando reconhecidos. Não usa o nome do titular da conta como nome do cliente. Mais de um endereço no documento pede conferência manual. O resultado depende da legibilidade e do layout. Campos podem ser corrigidos antes de salvar.

O layout permanece compacto, com título e botão. Progresso, cancelamento e mensagens curtas aparecem durante o uso. Frente e verso podem ser anexados separadamente. Erro de OCR conserva o arquivo selecionado para armazenamento e permite digitação manual.

Ao salvar o cliente, o fluxo canônico grava os dados e envia os arquivos para o bucket privado `client-documents`. A tabela `contact_documents` vincula organização, cliente, categoria, caminho, nome, tamanho e autor. Não há URL pública persistida. O servidor confere perfil agent+, empresa ativa, contato existente não anonimizado, tamanho e assinatura real do formato. Download autenticado gera link de 60 segundos. Migração 9040 e baseline idempotente incluem tabela, RLS, bucket privado e fila de expurgo na remoção do registro. A cascata LGPD inclui os documentos cadastrais. Leitura OCR continua sem API paga ou transmissão a fornecedor de OCR; armazenamento é no Supabase da própria instalação.

Se o upload falhar, o modal fica aberto e informa o erro. O contato já criado é reutilizado no novo salvamento; arquivos já enviados permanecem identificados, os demais continuam pendentes. Fechar sem salvar descarta os anexos pendentes. Anexos antigos usados apenas para OCR antes desta funcionalidade devem ser enviados novamente, pois não foram armazenados naquela versão.

Os dados revisados alimentam o mesmo cadastro e a fotografia da negociação, usados no PDF pelo gerador existente. A fotografia guarda também os IDs dos documentos ligados ao salvamento pelo modal. O contrato imprime os dados, sem incorporar as imagens dos documentos ao PDF. Contratos históricos mantêm sua fotografia e não são reescritos ao mudar o cadastro.

## Sistema vivo

Entrada/porta: PDV → Cadastrar/Editar cliente → dois anexos. Saída: campos revisáveis → contatos → fotografia contratual/PDF; originais → documentos do cliente. Registro: progresso/erros no modal e auditoria canônica `contact.updated` com ID/categoria, sem texto extraído. Anti-morte: cancelamento, limite de tempo de OCR, erros visíveis e repetição de salvamento reutilizando o contato criado. Retorno: correção manual ou novo arquivo complementam o cadastro; nova negociação captura os dados atuais. Arquivos aparecem como links na edição do cliente, acessíveis após autorização. Mapa: `contrato-de-veiculos.architecture.json`.

## Provas

Unitários de cadastro, OCR e parser; invariantes de RLS/perfis, bucket privado, vínculo cruzado e fila de expurgo em `tests/invariants/documentos-do-cliente.test.ts`. Leitura real do comprovante sintético no localhost, endereço completo visível em `evidence/documento-do-cliente/endereco-extraido.png`. Não mede todos os layouts de contas reais, nem autentica o documento. O teste de invariantes usa banco descartável, não documentos reais.


## CNH-e com QR Code na mesma página

PDFs oficiais podem ter texto nativo somente nas instruções e guardar os dados pessoais em imagens pequenas. O leitor local usa as áreas de imagem do PDF, respeita transformações/rotação de página e as amplia separadamente. Cartões têm prioridade sobre o QR quadrado; regiões do mesmo tamanho são lidas de cima para baixo. Há limite de áreas e o limite de tempo anterior continua valendo. CNH vertical pode ter a frente lida separadamente. O quadro de registro é relido em modo numérico a partir da posição do rótulo REGISTRO reconhecida pelo OCR; não são completados dígitos por suposição. A leitura focada só é aplicada quando o texto está alinhado ao canvas.

A interpretação tolera bordas, ruído no prefixo numerado do rótulo e data da primeira habilitação ao lado do nome. Sobrenome Nascimento não é confundido com o rótulo da data. Não altera o arquivo original nem sua assinatura digital. O formulário apaga a mensagem de progresso quando a leitura termina sem dados.

Prova: PDF real fornecido pelo usuário lido pelo motor de produção `lerDocumentoCliente`, com adaptadores de canvas/worker Node no ensaio `lib/pdv/leitura-real-documento.test.ts`. OCR/PDF reais, sem texto ou resultado falso. Os cinco campos foram conferidos contra referência humana privada. O arquivo e a referência ficaram fora do repositório e não foram salvos como cliente. Esse ensaio é opcional: executar com `DOCUMENTO_REAL_VALIDACAO` apontando para arquivo local e, opcionalmente, `DOCUMENTO_REFERENCIA_PRIVADA` para JSON local com campos esperados. As assertivas não imprimem valores pessoais.

Testes permanentes sintéticos cobrem geometria, prioridade, recorte numérico e o rótulo do nome com data vizinha. A conexão CUA com o navegador ficou indisponível nesta rodada; portanto, o resultado novo não foi repetido pela interface. Isso não deve ser relatado como QA visual concluído.

Validação final da correção: typecheck, ESLint dos arquivos alterados, 332 casos na seleção de testes e build de produção concluídos. O ensaio real conferiu os cinco campos em cerca de dois segundos no ambiente Node. Retirar a tolerância do rótulo do nome fez o teste sintético correspondente reprovar; a proteção foi restaurada. Nenhum dado pessoal ficou em fixture ou screenshot no repositório.


### Nome ausente no formulário

A leitura complementar delimita o quadro abaixo de NOME/SOBRENOME pelo campo da primeira habilitação. Se a leitura principal omitir o nome, o PDF continua sendo examinado até a zona mecânica. O nome da zona mecânica precisa corresponder ao registro e nascimento lidos na frente; os dígitos legíveis são comparados sem gerar números novos. Quando um único dígito do código diverge, só se aceita o nome com confirmação adicional do nome da frente (mesmos termos, permitindo apenas uma letra omitida pelo OCR). Mudanças em nascimento, outros nomes ou mais de um dígito divergente são recusadas. A revisão humana continua necessária; isso não autentica documento.

Controle de regressão no PDF real: `DOCUMENTO_FORCAR_LEITURA_DO_NOME=1` remove o cabeçalho NOME do texto da primeira leitura, mantendo a imagem e o TSV reais. O motor conseguiu recuperar os cinco dados, incluindo o nome completo, conferidos por referência humana privada. A rodada inicial desse controle reproduziu nome incorreto; depois da correção passou. A conferência pela interface permanece pendente devido à indisponibilidade da conexão de navegador.

A verificação da correção do nome passou nos dois modos do ensaio real: leitura normal e nome ausente na primeira leitura. Também passaram os 27 testes selecionados, typecheck, ESLint e build de produção. Nenhum cadastro real foi salvo para a prova.

### Apresentação dos anexos

O componente compartilhado `CartaoDocumentoCliente` apresenta arquivos pendentes e salvos em cartões compactos: ícone de imagem/documento, nome com até duas linhas (texto completo no atributo title), tipo e formato. O tamanho aparece nos pendentes. A remoção de um arquivo ainda não salvo usa botão de ícone com nome acessível; documentos salvos usam Abrir com o mesmo endereço autenticado anterior. A alteração é somente de apresentação, sem criar exclusão de documentos salvos ou modificar upload/OCR. Os consumidores são o formulário do PDV e `DocumentosDoCliente`. A verificação visual ao vivo desta alteração ficou indisponível porque a conexão de navegador não respondeu; não equivale a QA visual concluído.

### Declaração de residência com endereço no corpo

O parser identifica frases pessoais como “meu endereço é na”, “resido na” e “residente e domiciliado na”. Esse trecho passa a ser a fonte da leitura, preservando quebras de linha até uni-las para interpretação da frase. Assim, endereço e CEP do emissor no cabeçalho não são atribuídos ao cliente. Aceita CEP com ou sem ponto, o prefixo genérico Rua/Avenida e bairro/cidade/UF na mesma frase. O prefixo genérico é retirado do logradouro; CEP e bairro não viram complemento. Sem um declarante identificado, mantém a guarda anterior contra múltiplos endereços; duas declarações pessoais também não são escolhidas automaticamente. Dados já digitados seguem a regra existente de preenchimento de campos vazios.

Verificação: declaração real fornecida pelo usuário lida pelo mesmo `lerDocumentoCliente` em modo residência. Os seis campos foram conferidos por referência humana privada, sem usar os dados do cabeçalho, sem OCR desnecessário e sem salvar contato. Fonte e referência não são fixtures do repositório. Para reproduzir com arquivo local: executar `lib/pdv/leitura-real-documento.test.ts` com `DOCUMENTO_TIPO_VALIDACAO=residencia`, `DOCUMENTO_REAL_VALIDACAO` e, opcionalmente, `DOCUMENTO_REFERENCIA_PRIVADA`. Testes sintéticos cobrem cabeçalho com outro endereço, CEP pontuado, frase em múltiplas linhas, complemento e ambiguidade. Não foi repetida a leitura pela interface porque a conexão de navegador permaneceu indisponível.
