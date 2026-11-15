/**
 * Valor em reais por extenso, derivado só do valor numérico em centavos.
 * Uso contratual: "R$ 80.000,00 (oitenta mil reais)". Não aceita negativos.
 */
const UNIDADES = [
  "zero",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const DEZENAS = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];
const CENTENAS = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];
const ESCALAS: [singular: string, plural: string][] = [
  ["", ""],
  ["mil", "mil"],
  ["milhão", "milhões"],
  ["bilhão", "bilhões"],
  ["trilhão", "trilhões"],
];

/** 0–999. */
function ate999(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]!);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]!);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]!);
    }
  }
  return partes.join(" e ");
}

/** Inteiro não negativo por extenso (masculino). */
export function inteiroPorExtenso(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("Valor inválido para extenso.");
  if (n === 0) return "zero";
  const grupos: number[] = [];
  for (let r = n; r > 0; r = Math.floor(r / 1000)) grupos.push(r % 1000);
  if (grupos.length > ESCALAS.length) throw new RangeError("Valor alto demais para extenso.");
  const partes: { texto: string; valor: number }[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i]!;
    if (!g) continue;
    const [singular, plural] = ESCALAS[i]!;
    // "mil", não "um mil".
    const numero = i === 1 && g === 1 ? "" : ate999(g);
    const escala = i === 0 ? "" : g === 1 ? singular : plural;
    partes.push({ texto: [numero, escala].filter(Boolean).join(" "), valor: g });
  }
  // Liga com "e" o último grupo quando ele é < 100 ou centena redonda
  // ("mil e quinhentos", "dois mil e vinte"); senão, espaço ("dois mil trezentos e vinte").
  return partes
    .map((p, i) => {
      if (i === 0) return p.texto;
      const ultimo = i === partes.length - 1;
      const liga = ultimo && (p.valor < 100 || p.valor % 100 === 0) ? " e " : " ";
      return liga + p.texto;
    })
    .join("");
}

/** Centavos → "oitenta mil reais", "um real e cinquenta centavos", "um milhão de reais". */
export function reaisPorExtenso(centavos: number): string {
  if (!Number.isSafeInteger(centavos) || centavos < 0)
    throw new RangeError("Valor inválido para extenso.");
  const reais = Math.floor(centavos / 100);
  const cents = centavos % 100;
  const partes: string[] = [];
  if (reais) {
    // "um milhão de reais", "dois bilhões de reais"; "um milhão e mil reais" não leva "de".
    const deMilhar = reais >= 1_000_000 && reais % 1_000_000 === 0;
    partes.push(
      `${inteiroPorExtenso(reais)}${deMilhar ? " de" : ""} ${reais === 1 ? "real" : "reais"}`,
    );
  }
  if (cents) partes.push(`${inteiroPorExtenso(cents)} ${cents === 1 ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero real";
}
