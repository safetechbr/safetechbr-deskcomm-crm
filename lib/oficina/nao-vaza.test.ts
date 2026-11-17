import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { COLUNAS_DO_VEICULO } from "@/lib/veiculos/regras";

/**
 * Custo de compra, reparos e custo total são INTERNOS. Nada que o cliente vê
 * (contrato, comprovante, PDF, vitrine, rotas públicas) pode ler essas colunas.
 */
const RAIZ = process.cwd();
const PROIBIDO =
  /custo_cents|custoTotal|custoTotalDoVeiculo|veiculo_reparos|totalDosReparos|lib\/oficina/;

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\./.test(nome)) out.push(p);
  }
  return out;
}

describe("oficina — não vaza ao cliente", () => {
  it("as colunas públicas do veículo não trazem custo", () => {
    expect(COLUNAS_DO_VEICULO).not.toMatch(/custo/);
  });

  const SUPERFICIES = [
    "lib/pdv",
    "components/pdv",
    "app/pdv",
    "app/(public)",
    "app/vitrine-agenda",
    "app/api/v1/pdv",
    "app/api/v1/veiculos",
    "lib/veiculos",
  ];
  for (const rel of SUPERFICIES) {
    it(`${rel} não lê custo, reparo nem a Oficina`, () => {
      let dir: string;
      try {
        dir = join(RAIZ, rel);
        statSync(dir);
      } catch {
        return; // superfície inexistente: nada a vigiar
      }
      const ofensores = arquivos(dir).filter((f) => PROIBIDO.test(readFileSync(f, "utf8")));
      expect(ofensores).toEqual([]);
    });
  }
});
