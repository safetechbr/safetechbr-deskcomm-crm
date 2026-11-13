# Colaboração Codex × Claude Code

Duas ferramentas editam este repositório. Para não colidirem, cada uma tem uma **área**
e um **fluxo**. Vale para as duas e para qualquer outra que entrar.

## Quem mexe em quê

| Área | Dono | Caminhos |
|---|---|---|
| **Visual** (aparência, layout, interação) | **Codex** | `components/**` (exceto lógica de hooks), `app/**/page.tsx` e `app/**/_client.tsx` no que for marcação e estilo, `app/globals.css`, `public/`, `lib/branding/**`, `docs/design/**` |
| **Estrutura** (dados, regras, integrações, infra) | **Claude Code** | `app/api/**`, `lib/**` (exceto `lib/branding`), `hooks/**`, `supabase/**`, `docker/**`, `scripts/**`, `tests/unit`, `tests/invariants`, `package.json`, `pnpm-lock.yaml`, deploy |

Regras fixas, sem exceção:
- **Migrations, dependências e deploy: só o Claude Code** (ou o próprio dono do projeto). Quem precisar de uma coluna nova ou de um pacote pede, não cria.
- **Arquivo da outra área não se edita.** Se a tela precisa de dado novo, o Codex descreve o que falta; se a API mudou o formato, o Claude avisa.
- **Arquivos compartilhados** (`CLAUDE.md`, `AGENTS.md`, `docs/**`): só acrescente; não reescreva o que é da outra ferramenta.

## Funcionalidade que cruza as duas áreas

Em sequência, nunca em paralelo:
1. **Claude** entrega a base (API, regra, migration, tipos) e commita.
2. O dono do projeto faz o merge.
3. **Codex** cria a tela, partindo da base já commitada.

## Fluxo de trabalho

1. **Uma branch por ferramenta e por tarefa**: `claude/<tema>` e `codex/<tema>`. Ideal em worktrees separados (`git worktree add ../deskcomm-codex codex/<tema>`), assim as pastas nunca se misturam.
2. **Antes de começar**: `git status` limpo e `git pull`. Se houver mudança solta que não é sua, pare e avise.
3. **Ao terminar uma tarefa**: commit pequeno e descritivo, com teste passando. Não deixe trabalho sem commit ao trocar de ferramenta.
4. **Deploy só de commit** (`git archive <commit>`), nunca da pasta de trabalho. Assim produção sempre bate com o Git.
5. **Uma tarefa por vez em cada ferramenta**, e não duas ferramentas na mesma funcionalidade.
