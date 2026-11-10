/**
 * Decide, pelos pixels, se o logo some contra um fundo escuro.
 *
 * Só conta o que o logo DESENHA (alfa visível): num PNG sem fundo, o
 * transparente não pesa. Média de luminância percebida (0–1) abaixo do limiar
 * = arte escura (preto, azul-marinho, cinza-chumbo) que precisa virar clara no
 * tema escuro. Cores vivas (vermelho, laranja, verde) ficam como estão.
 */
export const LIMIAR_DE_LUMINANCIA = 0.22;
const ALFA_MINIMO = 40;

export function logoEscuroDemais(rgba: ArrayLike<number>): boolean {
  let soma = 0;
  let peso = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const a = rgba[i + 3]!;
    if (a < ALFA_MINIMO) continue;
    const l = (0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!) / 255;
    soma += l * a;
    peso += a;
  }
  if (peso === 0) return false;
  return soma / peso < LIMIAR_DE_LUMINANCIA;
}
