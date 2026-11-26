/**
 * Rótulos e regra de pendência do RENAVE para a tela. Sem imports de servidor:
 * roda no cliente do estoque.
 */
export interface RenaveDoVeiculo {
  situacao: string | null;
  documentos: Record<string, { disponivel?: boolean; arquivos?: unknown[] }> | null;
  ultimo_erro: string | null;
}

export const ROTULO_DA_SITUACAO: Record<string, string> = {
  "": "Sem RENAVE", S: "RENAVE: solicitado", T: "RENAVE: no Detran", C: "RENAVE: confirmado",
  V: "RENAVE: vendido", E: "RENAVE: transferido", I: "RENAVE: transferido (filial)", X: "RENAVE: cancelado",
};

export const ROTULO_DO_DOCUMENTO: Record<string, string> = {
  termo_entrada: "Termo de entrada", atpve_entrada: "ATPV-e de entrada", crlve: "CRLV-e",
  termo_saida: "Termo de saída", atpve_saida: "ATPV-e de saída",
};

/**
 * Pendência = algo a fazer no RENAVE: erro no último envio/consulta, carro
 * vendido sem saída registrada, ou carro em estoque sem entrada confirmada.
 */
export function pendenteNoRenave(r: RenaveDoVeiculo | undefined, statusDoVeiculo: string): boolean {
  if (r?.ultimo_erro) return true;
  const s = r?.situacao ?? "";
  if (statusDoVeiculo === "vendido") return !["V", "E", "I"].includes(s);
  return s !== "C";
}
