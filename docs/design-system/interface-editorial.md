# Interface editorial — M auto

Decisão do usuário em 08/11/2026: usar a loja Techshop como referência para o sistema inteiro, preservando a marca M auto. A implementação é uma linguagem compartilhada de interface, e não uma cópia de catálogo ou conteúdo comercial.

## Fonte e alcance

`app/interface-editorial.css`, importada no layout raiz e ativada por `data-interface="editorial"`, define superfícies brancas, texto quase preto, ações monocromáticas, bordas cinza, raios amplos e detalhe coral/rosa. Fontes de sistema dispensam downloads. Os mesmos tokens alcançam login, administração, equipe, cadastros, atendimento, CRM, agenda, financeiro e PDV. Os componentes compartilhados de cartão, botão, campo, tabela, textarea e diálogo completam o tratamento. A casca mantém navegação e controles existentes. Dashboard e estoque recebem composição específica.

A camada editorial determina as cores dos controles, com precedência explícita sobre a cor cadastrada de marca. Nome, logotipo, arquivos da empresa e configurações de marca não são alterados. As cores semânticas de sucesso, alerta e erro são preservadas. O tema escuro tem tokens próprios; não é uma inversão da página.

## Verificação

- 37 testes existentes passaram: menu lateral, controle de recolher, login, tema e comportamento do diálogo.
- Typecheck e lint dos arquivos alterados sem erros.
- Inspeção no navegador: dashboard, estoque, atendimento e PDV; dashboard em 390 × 844. O teste não criou vendas nem modificou registros de clientes.
- Contraste claro: texto principal 18,98:1; texto secundário 5,69:1; texto sutil 4,91:1. As duas pontas do gradiente textual têm mais de 5:1 no branco.
- Tema escuro verificado nos tokens e contraste; não foi feita inspeção visual de todas as telas no escuro.
- A consulta de negociações passou a aceitar a ausência da coluna modalidade, evitando que o dashboard dependa da ativação pendente do crediário. Nenhuma migração foi aplicada ao banco.
- O gate E2E completo não foi executado: o ambiente isolado `.env.e2e` continua ausente. A inspeção não equivale a testar todos os fluxos do produto.

## Checklist Sistema Vivo

Entrada: layout raiz e componentes compartilhados. Saída: todas as rotas renderizadas nessa árvore. Porta: navegação existente. Observação: foco, hover, item ativo e estados semânticos preservados. Registro: alteração visual em `.changes/interface-editorial.md`; não há mutação operacional a auditar. Configuração: estilo editorial no layout, tema claro/escuro existente e identidade textual no resolvedor de marca. Continuidade e laço de retorno: nenhuma regra de atendimento ou agente foi alterada; correções visuais retornam aos mesmos tokens e componentes. Mapa: layout → interface-editorial.css → componentes/ui e casca → telas; dashboard e estoque consomem os mesmos tokens.

## Tipografia confirmada no menu autenticado

Após login feito pelo usuário na referência PerIpsum, o CSS computado dos links e botões do menu confirmou a mesma sequência de fontes já aplicada: `-apple-system, system-ui, "Inter Variable", Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Itens: 14 px / peso 400 / linha 20 px / espaçamento −0,4 px. Títulos Ações Rápidas e Navegação: 12 px / peso 500 / linha 16 px / espaçamento −0,4 px / sem transformação para maiúsculas. Essas medidas foram aplicadas aos itens e títulos correspondentes da barra do sistema. A interface base usa 15 px e o mesmo espaçamento; controles e títulos com medidas próprias continuam explícitos. Não foi necessária extração ou instalação de arquivo de fonte.
