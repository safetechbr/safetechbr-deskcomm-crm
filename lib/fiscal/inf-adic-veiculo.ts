/**
 * Dados do veículo usado vão em infAdProd (sem o grupo veicProd).
 * "Veículo usado – MARCA MODELO – Ano fab/mod – Cor – Chassi – Placa – Renavam – Km"
 */

export interface DadosDoVeiculoFiscal {
  marca: string | null;
  modelo: string | null;
  anoFabricacao: number | null;
  anoModelo: number | null;
  cor: string | null;
  chassi: string | null;
  placa: string | null;
  renavam: string | null;
  km: number | null;
}

/** Limite do campo infAdProd na NF-e. */
export const LIMITE_INF_AD_PROD = 500;

export function infAdProdVeiculo(v: DadosDoVeiculoFiscal): string {
  const nome = [v.marca, v.modelo].filter(Boolean).join(" ").toUpperCase();
  const ano =
    v.anoFabricacao || v.anoModelo ? `Ano ${v.anoFabricacao ?? "?"}/${v.anoModelo ?? "?"}` : null;
  const partes = [
    "Veículo usado",
    nome || null,
    ano,
    v.cor ? `Cor ${v.cor}` : null,
    v.chassi ? `Chassi ${v.chassi.toUpperCase()}` : null,
    v.placa ? `Placa ${v.placa.toUpperCase()}` : null,
    v.renavam ? `Renavam ${v.renavam}` : null,
    v.km != null ? `Km ${v.km}` : null,
  ].filter((p): p is string => Boolean(p));
  return partes.join(" – ").slice(0, LIMITE_INF_AD_PROD);
}
