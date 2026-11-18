/**
 * VERSÃO DO CONTRATO — minuta ou versão para assinatura, decidida a partir do
 * retrato da operação e do manifesto da pasta (./retrato-da-operacao.ts,
 * ./manifesto-da-pasta.ts). O gerador do PDF só lê esta decisão.
 *
 * Regras (ficha 01 de output/documentos-veiculares; análise funcional, não
 * validação jurídica):
 *  - durante a negociação (rascunho) o documento é minuta;
 *  - negociação concluída sai para assinatura só sem pendência nenhuma: um
 *    aviso (dado que sairia em branco no contrato) também faz a minuta;
 *  - compra pela loja ainda não tem contrato de aquisição: sempre minuta;
 *  - anexos sem gerador não impedem a assinatura do contrato, mas aparecem
 *    como pendência explícita na minuta e no cabeçalho da resposta, e o
 *    contrato não faz referência a anexo que não existe.
 */
import {
  manifestoDaPasta,
  type DocumentoDaPasta,
  type ManifestoDaPasta,
} from "./manifesto-da-pasta";
import type { Negociacao } from "./regras";
import {
  retratoDaOperacao,
  type PendenciaDoDocumento,
  type RetratoDaOperacao,
} from "./retrato-da-operacao";

export type VersaoDoContrato = "minuta" | "assinatura";

export interface DecisaoDoContrato {
  versao: VersaoDoContrato;
  /** Por que é minuta. Vazio na versão para assinatura. */
  motivos: string[];
  bloqueios: PendenciaDoDocumento[];
  avisos: PendenciaDoDocumento[];
  anexos_pendentes: DocumentoDaPasta[];
  retrato: RetratoDaOperacao;
  manifesto: ManifestoDaPasta;
}

export function decidirVersaoDoContrato(n: Negociacao): DecisaoDoContrato {
  const retrato = retratoDaOperacao(n);
  const manifesto = manifestoDaPasta(retrato);
  const bloqueios = retrato.pendencias.filter((p) => p.gravidade === "bloqueia");
  const avisos = retrato.pendencias.filter((p) => p.gravidade === "aviso");
  const motivos: string[] = [];
  if (n.status === "rascunho") motivos.push("Negociação em aberto.");
  if (n.status === "cancelada") motivos.push("Negociação cancelada.");
  if (bloqueios.length) motivos.push("Há dados obrigatórios a completar.");
  if (avisos.length) motivos.push("Há dados que sairiam em branco no contrato.");
  return {
    versao: motivos.length ? "minuta" : "assinatura",
    motivos,
    bloqueios,
    avisos,
    anexos_pendentes: manifesto.anexos_pendentes,
    retrato,
    manifesto,
  };
}
