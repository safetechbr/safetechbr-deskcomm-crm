# Contrato de veículos

Destino: núcleo, ampliando o PDV e o estoque já distribuídos. Não cria uma operação paralela de venda.

## Uso

1. Em Configurações › Empresa, abrir **Dados da empresa para contratos de veículos**. Razão social, nome de exibição e CNPJ usam os campos cadastrais existentes. Completar endereço, número, complemento, bairro, CEP, cidade, UF, telefone e e-mail de contato. As cláusulas padrão são editáveis.
2. No cadastro/edição do estoque, preencher placa completa, chassi, Renavam, condição e **Débitos e regularização**. Cada item registra descrição, responsável (cliente, loja, quitado ou a definir), observação e valor. Ausência de informação não significa ausência de débitos.
3. No PDV, selecionar o veículo. **Revisar veículo no contrato** altera a fotografia desta negociação. Compra e troca usam a mesma ficha.
4. Usar **Cadastrar cliente** ou **Editar cadastro** na coluna Cliente para dados pessoais/razão social, CPF/CNPJ, nacionalidade, documentos e endereço. Esse é o único formulário do cliente: salvar atualiza o contato e a fotografia da negociação aberta. Em **Dados do contrato**, revisar somente empresa vendedora nesta operação, local, datas, atendente, detalhes de pagamentos, cláusulas e condição especial.
5. Salvar o rascunho e abrir o contrato em PDF pelo botão existente. Conferir antes de concluir; campos vazios são linhas em branco. O PDF de rascunho é identificado como tal. Negociações concluídas continuam sem edição pelo PDV.

O modelo fornecido pela loja não é validação jurídica. O editor sinaliza a necessidade de revisão dos textos, especialmente garantia. O cadastro da empresa define padrões futuros; não altera a fotografia de contratos já salvos. Contratos antigos sem fotografia contratual mantêm o gerador anterior. Ao editar um rascunho antigo pela nova interface, os padrões são apresentados para revisão e serão salvos com ele.

O total, desconto, troca e formas de pagamento são os da negociação. Os valores de regularização são informativos para o contrato: não geram despesas financeiras adicionais. A conclusão de compra/troca conserva condição e regularização no veículo que entra no estoque, na mesma transação.

## Persistência e acesso

Migration 9039 adiciona `organizations.dados_contrato`, `negociacoes_de_veiculo.contrato`, `veiculos.condicao` e `veiculos.regularizacao`, sem backfill de dados pessoais ou de cláusulas em contratos históricos. O baseline inclui a mesma alteração idempotente. Campos são validados em Zod e o banco restringe os tipos JSON/condição. A RLS e as autorizações existentes continuam valendo: administração configura a empresa, agent+ negocia e viewer autorizado consulta o PDF. Novos contratos capturam os padrões no POST; PATCH continua restrito a rascunhos. Nenhum segredo ou dado real do PDF original é usado como fixture.

## Sistema vivo

- Entrada: Configurações › Empresa e Estoque alimentam o PDV.
- Saída: a negociação alimenta o PDF e, na compra/troca, o estoque.
- Registro: auditorias canônicas de organização e negociação; o cadastro e o rascunho mostram o resultado.
- Porta: destinos existentes Empresa, Estoque e PDV; nenhuma nova rota de navegação.
- Anti-morte: não há demanda autônoma ou fila; o próximo passo é salvar/revisar/concluir no PDV. Erros de gravação permanecem visíveis pelo fluxo existente.
- Configuração: padrões na Empresa; campos ausentes aparecem vazios para revisão no PDV/PDF.
- Continuidade: captura humana estruturada; nenhuma ação de IA, envio ou assinatura automática foi adicionada.
- Retorno: corrigir o rascunho muda o PDF; corrigir o padrão da empresa muda os próximos rascunhos. Não há decisão automática para treinar.
- Mapa: `docs/architecture/contrato-de-veiculos.architecture.json` conecta cadastros, PDV, fotografia, auditoria, PDF e estoque recebido.

## Verificação

- Unitários: `lib/pdv/modelo-contrato.test.ts`, crediário e cadastro de cliente.
- Banco real: `tests/invariants/contrato-de-veiculos.test.ts` e `pdv-crediario.test.ts`; baseline install e update no Postgres descartável.
- PDF: reproduzir com `node --import tsx scripts/gerar-exemplo-contrato.ts`. `evidence/contrato-modelo/exemplo.pdf` e três páginas PNG renderizadas, somente dados sintéticos. O exemplo tem troca, quitação, débito, financiamento e PIX. Texto extraído confere total, assinaturas e ausência dos dados atuais da loja passados ao gerador.
- Validação manual autenticada no localhost: campos de empresa/estoque, criação e edição do rascunho sintético, recarregamento, reabertura pelo histórico e download do PDF. Dados do contrato, condição, débito e centavos conferidos no PDF baixado. Capturas em `evidence/contrato-modelo/` e `rascunho-validado-na-tela.pdf`. A migração de crediário de 08/11 já existente no repositório precisou ser aplicada no desenvolvimento: faltava `modalidade`, causando 500 no salvamento.
- Isso não substitui uma execução Playwright em instalação fresca: não há `.env.e2e` nem Supabase local completo neste workspace; instalação/reaplicação do baseline foi validada no ambiente temporário de invariantes.

## Cadastro único do cliente

Os dados básicos usam as colunas canônicas de `contacts`. Nacionalidade, RG, CNH, endereço completo e CNPJ ficam em `contacts.custom_fields.cadastro_cliente`, um bloco validado do próprio contato. Nenhuma tabela ou cadastro paralelo é criado. CPF permanece exclusivamente no caminho cifrado já existente; não é copiado para esse bloco. A busca do PDV lê o contato completo e solicita o CPF pela finalidade contratual, respeitando o papel já exigido pelo servidor (sem ampliar autorização de descriptografia).

O modal do PDV serve tanto para criar quanto para editar. Ao editar, utiliza PATCH no mesmo ID e preserva os outros campos personalizados do CRM; campos complementares podem ser limpos explicitamente. Ao completar um contato prévio pelo mesmo telefone, mantém o ID e complementa apenas os dados informados, com as guardas de conflito já existentes. A fotografia da negociação é atualizada ao salvar o cadastro aberto; contratos anteriores continuam preservados. O cadastro canônico não passa a ser consultado ao reimprimir contratos históricos.

O bloco compartilha a RLS, auditoria e anonimização de `custom_fields` existentes. Não altera a semântica de substituição do PATCH genérico de contatos; o modal monta o objeto preservando os demais campos. Não adiciona transmissão ou ação de IA. Testes do modal provam o POST, PATCH e o callback que alimenta a negociação; testes puros cobrem CNPJ, preenchimento completo, proteção do CPF e preservação dos dados do CRM.

Nacionalidade usa um catálogo local de sugestões em `lib/contacts/nacionalidades.ts`. O campo começa vazio; a pessoa digita e seleciona por clique ou teclado. Busca normalizada ignora acentos e caixa e reconhece grafias femininas comuns. O dado segue o mesmo cadastro e a mesma fotografia contratual. Evidência da interface em `evidence/nacionalidade-com-busca/`.

O cadastro único também aceita preenchimento pela CNH ou identidade, com leitura local de foto/PDF e conferência no próprio modal. Campos existentes prevalecem; os originais são guardados no cadastro do cliente com acesso restrito. Fluxo, limites e provas em [Documento do cliente no PDV](documento-do-cliente-no-pdv.md).

## Retrato da operação e pasta documental

`lib/pdv/retrato-da-operacao.ts` lê a negociação gravada e devolve o cenário (venda simples, venda com troca, compra direta), o tipo de comprador, os blocos que o documento deve imprimir ou omitir, os valores conciliados e as datas previstas de entrega e de recebimento da troca. Também lista só o que falta, apontando onde completar (empresa, cliente, veículo, troca, pagamentos, contrato). Datas previstas nunca são tratadas como evento ocorrido. A quitação aparece como não rastreada, porque o financeiro atual marca como pagos, na conclusão, todos os pagamentos que não são crediário.

`lib/pdv/manifesto-da-pasta.ts` usa o retrato para listar os 11 documentos da pasta. Cada um fica como pronto, faltam dados, não se aplica ou modelo não implementado. Quando o sistema ainda não registra a condição de aplicação (garantia, despachante, proprietário registral, comprovante de residência), o item diz isso em vez de presumir. Nenhuma tela ou rota consome esses módulos ainda. Testes: `lib/pdv/retrato-da-operacao.test.ts`. Esta é uma análise funcional, não uma validação jurídica.

## Minuta e versão para assinatura

`lib/pdv/versao-do-contrato.ts` (`decidirVersaoDoContrato`) decide a versão a partir do retrato e do manifesto. O gerador do PDF só lê essa decisão.

- **Minuta:** negociação em rascunho, cancelada, ou com pendência que bloqueia. Compra pela loja é sempre minuta, porque ainda não existe contrato de aquisição. A minuta leva "MINUTA" no cabeçalho e "Pendências desta minuta" na última página: motivos, dados que faltam com o lugar de cada um, avisos e documentos da pasta ainda sem emissão.
- **Assinatura:** negociação concluída sem bloqueio. Os anexos que não têm gerador (termo de entrega e outros) não impedem a assinatura. Eles aparecem na resposta, e o contrato não cita anexo que não existe.
- **Blocos por fato:** troca, quitação da troca e desconto só são impressos quando o retrato os liga. A cláusula especial vazia some na versão para assinatura.
- **Valor por extenso:** é derivado só do valor em centavos (`lib/pdv/valor-por-extenso.ts`), nunca digitado.
- **Comprador PJ:** é qualificado por CNPJ e sede, sem nacionalidade, nascimento nem RG.
- **Datas:** a entrega e o recebimento da troca aparecem como "previstas". Financiamento aprovado não é crédito recebido, e o contrato não afirma recebimento.

A rota `GET /api/v1/pdv/negociacoes/:id/contrato` acrescenta `-minuta` ao nome do arquivo e devolve dois cabeçalhos: `X-Contrato-Versao` (`minuta`|`assinatura`) e `X-Contrato-Anexos-Pendentes` (lista separada por vírgula). O contrato histórico, sem fotografia contratual, não muda. Para conferir:

```bash
npx vitest run --project produto lib/pdv/contrato-modelo.test.ts lib/pdv/valor-por-extenso.test.ts
```
