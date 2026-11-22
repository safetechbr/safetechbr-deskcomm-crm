/**
 * Serviço RENAVE por organização: junta configuração (chave cifrada), lock por
 * veículo, upsert de vendedor/comprador + veículo, envio de NF-e e consulta de
 * status. Toda leitura/escrita filtra por `organization_id` (service_role não
 * tem RLS). A chave é decifrada só aqui, na hora de usar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { byteaToBuffer, decryptKey } from "@/lib/crypto/aes_gcm";

import { criarRenaveFacil } from "./renave-facil";
import {
  RenaveErro,
  type ClienteRenave,
  type IntegradoraRenave,
  type SituacaoRenave,
  type TipoDocumentoRenave,
} from "./tipos";
import {
  chaveNfeValida,
  dataHoraLocal,
  montarVeiculo,
  pendenciasDeEnvio,
  soDigitos,
  type DadosPessoa,
} from "./validacao";

export const LOCK_MS = 2 * 60_000;
export const TIPOS_DOC: TipoDocumentoRenave[] = ["termo_entrada", "atpve_entrada", "crlve", "termo_saida", "atpve_saida"];

export interface ConfigRenave {
  id: string;
  cnpj: string;
  ativo: boolean;
  limiteCreditosAviso: number;
  bloquearVendaSemConfirmacao: boolean;
  urlPlataforma: string | null;
  integracao: IntegradoraRenave;
}

type Admin = SupabaseClient;

/** Mensagem em português para o lojista, sem jargão. */
export function mensagemDoErro(e: unknown): string {
  if (!(e instanceof RenaveErro)) return "Não foi possível falar com o RENAVE agora. Tente de novo em instantes.";
  switch (e.codigo) {
    case "renave_auth": return "A chave de acesso do RENAVE foi recusada. Confira a chave em Configurações › RENAVE.";
    case "renave_nao_vinculado": return "Este CNPJ não está vinculado à sua conta na integradora. Vincule a loja e tente de novo.";
    case "renave_nao_cadastrado": return "O veículo ainda não está cadastrado no RENAVE.";
    case "renave_ja_cadastrado": return "Este registro já existe no RENAVE.";
    case "renave_validacao": return `O RENAVE recusou os dados: ${e.message}`;
    case "renave_limite": return "Muitas consultas seguidas. Aguarde um minuto e tente de novo.";
    default: return "O RENAVE está indisponível no momento. Tente de novo em instantes.";
  }
}

/** Carrega a configuração da org e monta a integradora; null se não houver chave. */
export async function carregarConfig(admin: Admin, organizationId: string): Promise<ConfigRenave | null> {
  const { data } = await admin.from("renave_integracoes")
    .select("id, cnpj, ativo, limite_creditos_aviso, bloquear_venda_sem_confirmacao, url_plataforma, api_key_ciphertext, api_key_iv, api_key_tag")
    .eq("organization_id", organizationId).eq("integradora", "renave_facil").maybeSingle();
  if (!data || !data.api_key_ciphertext) return null;
  const apiKey = decryptKey({
    ciphertext: byteaToBuffer(data.api_key_ciphertext),
    iv: byteaToBuffer(data.api_key_iv),
    tag: byteaToBuffer(data.api_key_tag),
  });
  const registrar = async (r: { endpoint: string; metodo: string; status: number | null; ms: number; erro?: string }) => {
    // Sem corpo e sem dado pessoal. Falha de log nunca derruba a operação.
    await admin.from("renave_envios").insert({
      organization_id: organizationId, integradora: "renave_facil", operacao: r.endpoint, endpoint: r.endpoint,
      metodo: r.metodo, status_http: r.status, duracao_ms: Math.round(r.ms), codigo_erro: r.erro ?? null,
    }).then(() => undefined, () => undefined);
  };
  return {
    id: data.id as string,
    cnpj: data.cnpj as string,
    ativo: Boolean(data.ativo),
    limiteCreditosAviso: Number(data.limite_creditos_aviso ?? 5),
    bloquearVendaSemConfirmacao: Boolean(data.bloquear_venda_sem_confirmacao),
    urlPlataforma: (data.url_plataforma as string | null) ?? null,
    integracao: criarRenaveFacil({ apiKey, registrar }),
  };
}

/** Lock por veículo: só um envio por vez. Devolve false se outro está em curso. */
export async function travar(admin: Admin, organizationId: string, veiculoId: string): Promise<boolean> {
  const agora = new Date();
  await admin.from("renave_veiculos").upsert(
    { organization_id: organizationId, veiculo_id: veiculoId, integradora: "renave_facil" },
    { onConflict: "organization_id,veiculo_id,integradora", ignoreDuplicates: true },
  );
  const { data } = await admin.from("renave_veiculos")
    .update({ em_envio_ate: new Date(agora.getTime() + LOCK_MS).toISOString() })
    .eq("organization_id", organizationId).eq("veiculo_id", veiculoId).eq("integradora", "renave_facil")
    .or(`em_envio_ate.is.null,em_envio_ate.lt.${agora.toISOString()}`)
    .select("id");
  return (data?.length ?? 0) > 0;
}

export async function destravar(admin: Admin, organizationId: string, veiculoId: string, patch: Record<string, unknown> = {}) {
  await admin.from("renave_veiculos").update({ ...patch, em_envio_ate: null })
    .eq("organization_id", organizationId).eq("veiculo_id", veiculoId).eq("integradora", "renave_facil");
}

export type Operacao = "compra" | "venda";

export interface ResultadoEnvio {
  ok: boolean;
  /** Lista do que falta, em português. */
  pendencias: string[];
  erro?: string;
  situacao?: SituacaoRenave;
}

function pessoaDoCliente(c: Record<string, unknown> | null): DadosPessoa | null {
  if (!c) return null;
  const s = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : null);
  return {
    nome: s("nome"), documento: s("documento"), cep: s("cep"), logradouro: s("endereco"),
    numero: s("numero"), bairro: s("bairro"), municipio: s("cidade"), uf: s("uf"),
  };
}

function clienteRenave(p: DadosPessoa, c: Record<string, unknown>): ClienteRenave {
  return {
    id: soDigitos(p.documento), razaoSocial: (p.nome ?? "").trim(), cep: soDigitos(p.cep),
    logradouro: p.logradouro ?? "", numero: p.numero ?? "",
    complemento: typeof c.complemento === "string" && c.complemento ? c.complemento : null,
    bairro: p.bairro ?? "", cidade: p.municipio ?? "", uf: (p.uf ?? "").toUpperCase(),
    email: typeof c.email === "string" && c.email ? c.email : null,
  };
}

/**
 * Envia um veículo ao RENAVE: valida, cadastra a outra parte e o veículo e, se
 * houver chave de NF-e, envia a NF-e (compra/troca ou venda). Se a NF-e voltar
 * 404 (veículo não cadastrado), recadastra e repete UMA vez.
 */
export async function enviarVeiculo(
  admin: Admin,
  organizationId: string,
  veiculoId: string,
  op: Operacao,
  opts: { chaveNfe?: string | null; valorCents?: number; cliente: Record<string, unknown> | null },
): Promise<ResultadoEnvio> {
  const cfg = await carregarConfig(admin, organizationId);
  if (!cfg || !cfg.ativo) return { ok: false, pendencias: ["A integração RENAVE não está ativa. Configure em Configurações › RENAVE."] };

  const { data: v } = await admin.from("veiculos")
    .select("id, chassi, placa, renavam, marca, modelo, ano_fabricacao, ano_modelo")
    .eq("organization_id", organizationId).eq("id", veiculoId).maybeSingle();
  if (!v) return { ok: false, pendencias: ["Veículo não encontrado."] };

  const chave = opts.chaveNfe ? soDigitos(opts.chaveNfe) : null;
  const pessoa = pessoaDoCliente(opts.cliente);
  const pendencias = pendenciasDeEnvio(v, pessoa, chave);
  if (pendencias.length > 0 || !pessoa || !opts.cliente) return { ok: false, pendencias };

  if (!(await travar(admin, organizationId, veiculoId))) {
    return { ok: false, pendencias: [], erro: "Já existe um envio deste veículo em andamento. Aguarde alguns instantes." };
  }

  const veic = montarVeiculo(v);
  const cliente = clienteRenave(pessoa, opts.cliente);
  const cadastrar = async () => {
    await cfg.integracao.enviarCliente(cfg.cnpj, cliente);
    await cfg.integracao.enviarVeiculo(cfg.cnpj, veic);
  };
  const agora = new Date().toISOString();
  try {
    await cadastrar();
    const patch: Record<string, unknown> = { enviado_em: agora, ultimo_erro: null, proximo_polling_em: agora };
    if (chave && chaveNfeValida(chave)) {
      const nfe = {
        chassi: veic.chassi, tipoVeiculo: veic.tipoVeiculo, chaveNfe: chave, cpfCnpj: cliente.id,
        dtHrProcesso: dataHoraLocal(), valor: (opts.valorCents ?? 0) / 100,
      };
      const enviar = () => (op === "compra" ? cfg.integracao.enviarNfeCompra(cfg.cnpj, nfe) : cfg.integracao.enviarNfeVenda(cfg.cnpj, nfe));
      try {
        await enviar();
      } catch (e) {
        if (!(e instanceof RenaveErro) || e.codigo !== "renave_nao_cadastrado") throw e;
        await cadastrar();
        await enviar();
      }
      patch[op === "compra" ? "nfe_compra_enviada_em" : "nfe_venda_enviada_em"] = agora;
      if (op === "venda") patch.saida_em = agora;
    }
    await destravar(admin, organizationId, veiculoId, patch);
    return { ok: true, pendencias: [] };
  } catch (e) {
    const msg = mensagemDoErro(e);
    await destravar(admin, organizationId, veiculoId, { ultimo_erro: msg });
    return { ok: false, pendencias: [], erro: msg };
  }
}

/** Consulta o status de um veículo e grava situação + quais documentos existem. */
export async function atualizarStatus(
  admin: Admin,
  organizationId: string,
  veiculoId: string,
  cfgPronta?: ConfigRenave | null,
): Promise<{ situacao: SituacaoRenave; mudou: boolean } | { erro: string }> {
  const cfg = cfgPronta ?? (await carregarConfig(admin, organizationId));
  if (!cfg || !cfg.ativo) return { erro: "A integração RENAVE não está ativa." };
  const { data: v } = await admin.from("veiculos").select("placa, renavam")
    .eq("organization_id", organizationId).eq("id", veiculoId).maybeSingle();
  if (!v?.placa || !v?.renavam) return { erro: "Veículo sem placa ou Renavam." };
  const { data: atual } = await admin.from("renave_veiculos").select("situacao, documentos")
    .eq("organization_id", organizationId).eq("veiculo_id", veiculoId).eq("integradora", "renave_facil").maybeSingle();
  try {
    const st = await cfg.integracao.consultarStatus(cfg.cnpj, {
      placa: String(v.placa).replace(/[^A-Za-z0-9]/g, "").toUpperCase(), renavam: soDigitos(String(v.renavam)),
    });
    const docs = { ...((atual?.documentos as Record<string, unknown> | null) ?? {}) };
    for (const [k, tipo] of [["termoEntrada", "termo_entrada"], ["atpvEntrada", "atpve_entrada"], ["crlv", "crlve"], ["termoSaida", "termo_saida"], ["atpvSaida", "atpve_saida"]] as const) {
      const d = (docs[tipo] as Record<string, unknown> | undefined) ?? {};
      docs[tipo] = { ...d, disponivel: st.documentos[k] };
    }
    const sit = st.situacao || null;
    await admin.from("renave_veiculos").upsert({
      organization_id: organizationId, veiculo_id: veiculoId, integradora: "renave_facil",
      situacao: sit, documentos: docs, ultimo_polling_em: new Date().toISOString(), ultimo_erro: null,
    }, { onConflict: "organization_id,veiculo_id,integradora" });
    return { situacao: st.situacao, mudou: (atual?.situacao ?? null) !== sit };
  } catch (e) {
    const msg = mensagemDoErro(e);
    await admin.from("renave_veiculos").update({ ultimo_erro: msg, ultimo_polling_em: new Date().toISOString() })
      .eq("organization_id", organizationId).eq("veiculo_id", veiculoId).eq("integradora", "renave_facil");
    return { erro: msg };
  }
}

/**
 * Baixa um documento uma vez e guarda no bucket privado. Caminho começa pela
 * org (a trigger de LGPD e a RLS do bucket dependem disso). Se já foi baixado,
 * não baixa de novo.
 */
export async function baixarDocumento(
  admin: Admin,
  organizationId: string,
  veiculoId: string,
  tipo: TipoDocumentoRenave,
  cfgPronta?: ConfigRenave | null,
): Promise<{ baixou: boolean } | { erro: string }> {
  const cfg = cfgPronta ?? (await carregarConfig(admin, organizationId));
  if (!cfg) return { erro: "A integração RENAVE não está ativa." };
  const { data: rv } = await admin.from("renave_veiculos").select("documentos")
    .eq("organization_id", organizationId).eq("veiculo_id", veiculoId).eq("integradora", "renave_facil").maybeSingle();
  const docs = { ...((rv?.documentos as Record<string, { arquivos?: unknown[] }> | null) ?? {}) };
  if ((docs[tipo]?.arquivos?.length ?? 0) > 0) return { baixou: false };
  const { data: v } = await admin.from("veiculos").select("placa, renavam")
    .eq("organization_id", organizationId).eq("id", veiculoId).maybeSingle();
  if (!v?.placa || !v?.renavam) return { erro: "Veículo sem placa ou Renavam." };
  try {
    const r = await cfg.integracao.baixarDocumento(cfg.cnpj, {
      placa: String(v.placa).replace(/[^A-Za-z0-9]/g, "").toUpperCase(), renavam: soDigitos(String(v.renavam)),
    }, tipo);
    if (!r || r.pdfs.length === 0) return { baixou: false };
    const arquivos: { path: string; nome: string }[] = [];
    for (const [i, pdf] of r.pdfs.entries()) {
      const path = `${organizationId}/${veiculoId}/${tipo}-${i + 1}.pdf`;
      const up = await admin.storage.from("renave-documentos").upload(path, Buffer.from(pdf.base64, "base64"), {
        contentType: "application/pdf", upsert: true,
      });
      if (up.error) return { erro: "Não foi possível guardar o documento. Tente de novo." };
      arquivos.push({ path, nome: pdf.nome });
    }
    docs[tipo] = { ...(docs[tipo] ?? {}), arquivos, baixado_em: new Date().toISOString() } as { arquivos: unknown[] };
    await admin.from("renave_veiculos").update({ documentos: docs })
      .eq("organization_id", organizationId).eq("veiculo_id", veiculoId).eq("integradora", "renave_facil");
    return { baixou: true };
  } catch (e) {
    return { erro: mensagemDoErro(e) };
  }
}
