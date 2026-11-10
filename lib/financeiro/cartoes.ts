/** Cálculo puro dos cartões: quanto do limite está usado e quanto sobra. */

export function percentualUsado(usadoCents: number, limiteCents: number): number {
  if (limiteCents <= 0) return usadoCents > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((usadoCents / limiteCents) * 100)));
}

/** Nunca negativo: estourar o limite mostra R$ 0,00 disponível, não um valor devedor. */
export function disponivelCents(usadoCents: number, limiteCents: number): number {
  return Math.max(0, limiteCents - usadoCents);
}

export function somar(valores: number[]): number {
  return valores.reduce((a, b) => a + b, 0);
}
