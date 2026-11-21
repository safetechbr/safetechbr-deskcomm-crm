/**
 * Checklist "Ativar Notas Fiscais". Enquanto algum item obrigatório estiver
 * pendente, a emissão fica bloqueada. A nota de teste (item 6) só precisa dos
 * itens 1 a 5.
 */

export interface ConfigParaChecklist {
  cnpj: string | null;
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  crt: number | null;
  cnae: string | null;
  uf: string;
  credenciado_sefaz: boolean;
  certificado_validade: string | null;
  serie_nfe: number | null;
  proximo_numero_nfe: number | null;
  regras_revisadas_em: string | null;
  email_contador: string | null;
  ambiente: string;
  nota_teste_ok_em: string | null;
}

export interface ItemChecklist {
  id: 1 | 2 | 3 | 4 | 5 | 6;
  titulo: string;
  ok: boolean;
  /** O que falta, em português claro. Vazio quando ok. */
  pendencias: string[];
}

const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const preenchido = (s: string | null | undefined) => (s ?? "").trim().length > 0;
const emailValido = (s: string | null | undefined) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s ?? "").trim());

export function montarChecklist(c: ConfigParaChecklist, hoje: Date = new Date()): ItemChecklist[] {
  const dados: string[] = [];
  if (soDigitos(c.cnpj).length !== 14) dados.push("CNPJ com 14 dígitos");
  if (!preenchido(c.inscricao_estadual)) dados.push("Inscrição estadual ativa");
  if (!preenchido(c.inscricao_municipal)) dados.push("Inscrição municipal");
  if (!c.crt) dados.push("Regime tributário (CRT)");
  if (soDigitos(c.cnae).length !== 7) dados.push("CNAE com 7 dígitos");

  const cert: string[] = [];
  if (!c.certificado_validade) cert.push("Enviar o certificado A1 (.pfx) e a senha");
  else if (new Date(`${c.certificado_validade}T23:59:59`) < hoje) cert.push("Certificado vencido: envie um novo");

  const numeracao: string[] = [];
  if (c.serie_nfe == null || c.serie_nfe < 0 || c.serie_nfe > 999) numeracao.push("Série entre 0 e 999");
  if (!c.proximo_numero_nfe || c.proximo_numero_nfe < 1) numeracao.push("Próximo número maior que zero");

  const regras: string[] = [];
  if (!c.regras_revisadas_em) regras.push("Revisar as regras fiscais");
  if (!emailValido(c.email_contador)) regras.push("E-mail do contador");

  const item = (id: ItemChecklist["id"], titulo: string, pendencias: string[]): ItemChecklist => ({
    id,
    titulo,
    ok: pendencias.length === 0,
    pendencias,
  });

  return [
    item(1, "Dados da empresa", dados),
    item(
      2,
      "Credenciamento na SEFAZ-PI",
      c.credenciado_sefaz ? [] : ["Confirmar que a loja está credenciada como emissora de NF-e na SEFAZ-PI"],
    ),
    item(3, "Certificado digital A1", cert),
    item(4, "Série e numeração", numeracao),
    item(5, "Regras fiscais e contador", regras),
    item(6, "Ambiente e nota de teste", c.nota_teste_ok_em ? [] : ["Emitir a nota de teste em homologação"]),
  ];
}

export function podeEmitirNotaTeste(itens: ItemChecklist[]): boolean {
  return itens.filter((i) => i.id <= 5).every((i) => i.ok);
}

export function podeEmitir(itens: ItemChecklist[]): boolean {
  return itens.every((i) => i.ok);
}
