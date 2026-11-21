/** Alerta de validade do certificado A1: 30, 15 e 5 dias antes; vencido = 0. */

export type FaixaAlerta = 30 | 15 | 5 | 0;

export interface AlertaCertificado {
  faixa: FaixaAlerta;
  dias: number;
  mensagem: string;
}

const MS_DIA = 86_400_000;

/** `validade` no formato YYYY-MM-DD (coluna `date`). */
export function alertaDeCertificado(validade: string | null, hoje: Date = new Date()): AlertaCertificado | null {
  if (!validade) return null;
  const fim = Date.parse(`${validade}T00:00:00Z`);
  if (Number.isNaN(fim)) return null;
  const inicio = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  const dias = Math.round((fim - inicio) / MS_DIA);
  if (dias < 0) {
    return { faixa: 0, dias, mensagem: "Certificado digital vencido. Nenhuma nota pode ser emitida até enviar um novo." };
  }
  const faixa: FaixaAlerta | null = dias <= 5 ? 5 : dias <= 15 ? 15 : dias <= 30 ? 30 : null;
  if (faixa == null) return null;
  return {
    faixa,
    dias,
    mensagem: dias === 0 ? "Certificado digital vence hoje." : `Certificado digital vence em ${dias} dia(s).`,
  };
}
