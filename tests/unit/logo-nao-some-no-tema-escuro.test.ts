/**
 * O LOGO NO TEMA ESCURO: SEM CAIXA, E SEM SUMIR.
 *
 * Antes, sem arte própria para o escuro, o logo ia sobre um chip branco. O dono
 * da instalação pediu o contrário: PNG sem fundo não ganha fundo. A adaptação
 * agora é automática e por pixel (`components/branding/LogoAdaptativo.tsx` +
 * `lib/branding/logo-escuro-demais.ts`): arte escura demais é clareada por
 * filtro, arte colorida fica como está.
 *
 * Esta cerca garante que as três superfícies (barra lateral, tela de entrada,
 * prévia da tela de marca) desenham o logo pelo `LogoAdaptativo` e que nenhuma
 * voltou a pôr `bg-white` por baixo dele.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const leia = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
const semComentario = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

const SUPERFICIES = [
  "components/shell/Sidebar.tsx",
  "app/(public)/layout.tsx",
  "components/branding/CampoDeLogo.tsx",
];

describe("o logo do operador no tema escuro não ganha caixa", () => {
  for (const arquivo of SUPERFICIES) {
    it(`${arquivo} usa o LogoAdaptativo e não põe fundo branco`, () => {
      const fonte = semComentario(leia(arquivo));
      expect(fonte, `${arquivo} deixou de usar o LogoAdaptativo`).toMatch(/<LogoAdaptativo\b/);
      expect(fonte, `${arquivo} voltou a desenhar a caixa branca atrás do logo`).not.toMatch(
        /dark:bg-white|rounded-md bg-white/,
      );
    });
  }
});
