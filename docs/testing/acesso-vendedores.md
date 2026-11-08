# Acesso de vendedores por login e senha

Destino: núcleo. A gestão de pessoas usa o Auth e o vínculo de equipe já existentes; não depende de extensão nem cria schema novo.

## Fluxo e limites confirmados por código

Equipe oferece Criar vendedor (`/app/team/invite?modo=criar`). O administrador define nome, login único na instalação, senha, papel e interface. O endereço interno do Auth não é uma caixa postal. Só esta conta nova é confirmada automaticamente; a confirmação dos cadastros por e-mail permanece como antes. A conta nasce bloqueada, recebe vínculo, papel e interface pela função existente `fn_accept_team_invite`, e só então é ativada. A senha é enviada ao Auth e nunca devolvida na resposta ou na auditoria. Um erro de vínculo tenta remover somente a conta recém-criada.

O login aceita e-mail ou nome de usuário e mantém limites por conta/IP, sessão, MFA e RBAC. A identidade simples e o endereço interno usam o mesmo contador de falhas. A seleção da interface continua sendo navegação, sem criar permissões granulares novas. A recuperação sem e-mail usa Equipe → ações do vendedor → Definir senha, limitada a membro ativo e conta gerenciada pela organização da sessão.

## Verificação desta alteração

- 44 testes focados passaram (login, criação, redefinição, formulário, RBAC e lista de equipe).
- Typecheck completo passou com heap de 8 GB; lint dos arquivos alterados passou.
- O cadastro foi inspecionado no navegador autenticado; nenhuma conta real foi criada.
- Sabotagem temporária do papel exigido (admin → manager) fez o teste de criação falhar; o arquivo foi restaurado e o teste reexecutado.
- E2E completo não executado: falta `.env.e2e` com Supabase local. Não usar o banco configurado em `.env.local` como ambiente de teste.
- Cercas gerais identificaram falhas fora dos arquivos deste fluxo: marca hardcoded em `components/inbox/AcoesDaConversa.tsx` e `/app/dashboard` fora do catálogo/allowlist de navegação. Não corrigidas nesta alteração.
- Cadastro, login e redefinição contra um provedor Auth real ainda precisam de prova em ambiente isolado.

## Checklist Sistema Vivo

1. Entrada: administrador autenticado, validado por `requireRole(admin)` e `requireSupportWrite`.
2. Saída: conta Auth e vínculo em `user_organizations`, consumidos pelo login e permissões existentes.
3. Registro: `member.created` e `member.password_changed`, sem senha nos metadados.
4. Superfície: lista de Equipe, status do formulário e catálogo canônico de auditoria.
5. Porta: botões Criar vendedor e Convidar membros na Equipe.
6. Continuidade: falha aparece no formulário; conta incompleta permanece bloqueada e é removida quando possível. Sem laço automático por ser operação administrativa.
7. Configuração: papel e interface no cadastro; ajustes e revogação na lista de equipe.
8. IA/humano: os usuários são consumidos pelos mesmos vínculos de atendentes; nenhuma autonomia de IA é concedida.
9. Retorno: erros permitem corrigir campos; duplicidade não altera nem vincula conta preexistente; administrador pode redefinir senha e revogar acesso.
10. Mapa: `docs/architecture/acesso-vendedores.architecture.json`.
