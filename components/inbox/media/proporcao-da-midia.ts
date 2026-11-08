/** Medidas do arquivo, limitadas à bolha sem recortar nem distorcer a mídia.
 * O aspect-ratio também reduz a altura quando a conversa fica mais estreita. */
export function proporcaoDaMidia(largura: number, altura: number) {
  if (!Number.isFinite(largura) || !Number.isFinite(altura) || largura <= 0 || altura <= 0) {
    return { width: 320, aspectRatio: "4 / 3" };
  }
  const escala = Math.min(1, 384 / largura, 512 / altura);
  return { width: largura * escala, aspectRatio: `${largura} / ${altura}` };
}
