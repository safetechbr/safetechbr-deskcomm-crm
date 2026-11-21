/**
 * Cliente do integrador Renave Fácil (única peça que fala com ele).
 *
 * Endpoints: POST {base}/dms/{cnpj}/vehicle/nfe/purchase | sales.
 * Base e token vêm do ambiente (`RENAVE_FACIL_URL`, `RENAVE_FACIL_TOKEN`).
 *
 * ⚠️ A grafia do campo de valor difere entre as duas operações (`valor` x `Valor`);
 * ela fica ISOLADA em `montarCorpo` para que a correção, se o integrador
 * divergir, seja de uma linha.
 */

import type { PessoaFiscal, VeiculoFiscal } from "@/lib/fiscal/rascunho";

export type OperacaoRenave = "purchase" | "sales";

export type ResultadoRenave =
  | { tipo: "ok" }
  | { tipo: "nao_encontrado" }
  | { tipo: "transitorio"; erro: string }
  | { tipo: "rejeitado"; erro: string };

/** ENT_COMPRA_PF e ENT_TROCA entram no estoque (purchase); SAI_VENDA é sales. */
export function operacaoRenave(operacaoFiscal: string): OperacaoRenave | null {
  if (operacaoFiscal === "SAI_VENDA") return "sales";
  if (operacaoFiscal === "ENT_COMPRA_PF" || operacaoFiscal === "ENT_TROCA") return "purchase";
  return null;
}

/** `YYYY-MM-DDTHH:MM:SS` no horário local da loja (sem `Z`). Padrão: America/Sao_Paulo. */
export function dataHoraLocal(d: Date = new Date(), tz = "America/Sao_Paulo"): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

export interface DadosNfe {
  chave: string; valorCents: number; chassi: string; cpfCnpj: string; dtHrProcesso?: string;
}

export function montarCorpo(op: OperacaoRenave, d: DadosNfe): Record<string, unknown> {
  const valor = Number((d.valorCents / 100).toFixed(2));
  const base = {
    chassi: d.chassi, tipoVeiculo: "U", chaveNfe: d.chave, cpfCnpj: d.cpfCnpj.replace(/\D/g, ""),
    dtHrProcesso: d.dtHrProcesso ?? dataHoraLocal(),
  };
  // A grafia do campo difere entre as operações na doc do integrador; trocar aqui se o teste real divergir.
  return op === "purchase" ? { ...base, valor } : { ...base, Valor: valor };
}

export interface EntradaRenave {
  cnpj: string; op: OperacaoRenave; chave: string; valorCents: number;
  pessoa?: PessoaFiscal; veiculo?: VeiculoFiscal;
}

/** Uma linha do renave_log: endpoint em modelo (sem CPF/chassi) e nunca o corpo. */
export interface RegistroRenave { endpoint: string; metodo: string; status: number | null; ms: number; erro?: string }
export type Registrar = (r: RegistroRenave) => void | Promise<void>;

interface Resposta { status: number; corpo: string }

const dig = (v: string) => v.replace(/\D/g, "");

async function chamar(
  metodo: "POST" | "PUT", caminho: string, modelo: string, corpo: unknown, registrar?: Registrar,
): Promise<Resposta | { rede: string }> {
  const base = process.env.RENAVE_FACIL_URL as string;
  const t0 = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}${caminho}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RENAVE_FACIL_TOKEN}` },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(15_000),
    });
    const texto = res.ok ? "" : (await res.text().catch(() => "")).slice(0, 300);
    await registrar?.({ endpoint: modelo, metodo, status: res.status, ms: Date.now() - t0, erro: res.ok ? undefined : `http_${res.status}` });
    return { status: res.status, corpo: texto };
  } catch (e) {
    const erro = e instanceof Error ? e.message : "rede";
    await registrar?.({ endpoint: modelo, metodo, status: null, ms: Date.now() - t0, erro });
    return { rede: erro };
  }
}

function classificar(r: Resposta | { rede: string }): ResultadoRenave {
  if ("rede" in r) return { tipo: "transitorio", erro: r.rede };
  if (r.status === 429 || r.status >= 500) return { tipo: "transitorio", erro: `http_${r.status}` };
  return { tipo: "rejeitado", erro: `http_${r.status}: ${r.corpo}` };
}

/** POST; se já existe (409), PUT. 200 e 201 valem como sucesso. */
async function upsert(
  cnpj: string, recurso: "client" | "vehicle", postCorpo: Record<string, unknown>,
  chaveNoPut: string, putCorpo: Record<string, unknown>, registrar?: Registrar,
): Promise<ResultadoRenave> {
  const raiz = `/dms/${cnpj}/${recurso}`;
  const post = await chamar("POST", raiz, `POST ${raiz}`, postCorpo, registrar);
  if (!("rede" in post) && (post.status === 200 || post.status === 201)) return { tipo: "ok" };
  if ("rede" in post || post.status !== 409) return classificar(post);
  const put = await chamar("PUT", `${raiz}/${chaveNoPut}`, `PUT ${raiz}/:chave`, putCorpo, registrar);
  if (!("rede" in put) && (put.status === 200 || put.status === 201)) return { tipo: "ok" };
  return classificar(put);
}

function faltaDeDados(p: PessoaFiscal, v: VeiculoFiscal): string | null {
  const falta: string[] = [];
  if (!v.chassi) falta.push("chassi");
  if (!v.placa) falta.push("placa");
  if (!v.renavam) falta.push("renavam");
  if (!v.ano_fabricacao || !v.ano_modelo) falta.push("ano");
  if (![11, 14].includes(dig(p.documento).length)) falta.push("cpf_cnpj");
  if (!p.cep || !p.logradouro || !p.numero || !p.bairro || !p.municipio || !p.uf) falta.push("endereco");
  return falta.length ? `dados_incompletos: ${falta.join(", ")}` : null;
}

/** Cadastra (ou atualiza) cliente e veículo no Renave. */
async function cadastrar(cnpj: string, p: PessoaFiscal, v: VeiculoFiscal, registrar?: Registrar): Promise<ResultadoRenave> {
  const cli = {
    razaoSocial: p.nome, cep: dig(p.cep), logradouro: p.logradouro, numero: p.numero, ...(p.complemento ? { complemento: p.complemento } : {}),
    bairro: p.bairro, cidade: p.municipio, uf: p.uf, ...(p.email ? { email: p.email } : {}),
  };
  const id = dig(p.documento);
  const rc = await upsert(cnpj, "client", { id, tipoPessoa: id.length === 11 ? "F" : "J", ...cli }, id, cli, registrar);
  if (rc.tipo !== "ok") return rc;
  const veic = {
    descricao: [v.marca, v.modelo].filter(Boolean).join(" ").toUpperCase(),
    anoFabricacao: v.ano_fabricacao, anoModelo: v.ano_modelo, placa: v.placa, renavam: v.renavam,
  };
  return upsert(cnpj, "vehicle", { tipoVeiculo: "U", chassi: v.chassi, ...veic }, `${v.chassi}/U`, veic, registrar);
}

export async function enviarAoRenave(args: EntradaRenave, registrar?: Registrar): Promise<ResultadoRenave> {
  if (!process.env.RENAVE_FACIL_URL || !process.env.RENAVE_FACIL_TOKEN) return { tipo: "rejeitado", erro: "renave_nao_configurado" };
  const cnpj = dig(args.cnpj);
  const { pessoa, veiculo } = args;
  if (!pessoa || !veiculo) return { tipo: "rejeitado", erro: "dados_incompletos: pessoa/veiculo" };
  const falta = faltaDeDados(pessoa, veiculo);
  if (falta) return { tipo: "rejeitado", erro: falta };
  const c0 = await cadastrar(cnpj, pessoa, veiculo, registrar);
  if (c0.tipo !== "ok") return c0;
  const caminho = `/dms/${cnpj}/vehicle/nfe/${args.op}`;
  const enviar = () => chamar("POST", caminho, `POST /dms/:cnpj/vehicle/nfe/${args.op}`, montarCorpo(args.op, {
    chave: args.chave, valorCents: args.valorCents, chassi: veiculo?.chassi ?? "", cpfCnpj: pessoa?.documento ?? "",
  }), registrar);
  let r = await enviar();
  // 404: veículo sumiu do Renave (regra dos 90 dias) ou a nota ainda não apareceu. Recadastra e tenta uma vez.
  if (!("rede" in r) && r.status === 404) {
    const c = await cadastrar(cnpj, pessoa, veiculo, registrar);
    if (c.tipo !== "ok") return c;
    r = await enviar();
  }
  if (!("rede" in r) && r.status >= 200 && r.status < 300) return { tipo: "ok" };
  if (!("rede" in r) && r.status === 404) return { tipo: "nao_encontrado" };
  return classificar(r);
}
