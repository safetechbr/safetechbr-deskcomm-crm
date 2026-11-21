/**
 * Emissão de um documento fiscal já criado (rascunho ou rejeitada): valida,
 * reserva o número, envia ao provedor e grava o resultado. É o que o botão
 * "Emitir" / "Reemitir" chama.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aplicarResultado } from "./aplicar-resultado";
import { montarChecklist, podeEmitir, podeEmitirNotaTeste, type ConfigParaChecklist } from "./checklist";
import { carregarConfigComContexto } from "./config-servidor";
import { FocusNfeProvider } from "./focus/provider";
import { infAdProdVeiculo } from "./inf-adic-veiculo";
import type { DadosEmpresa, DocumentoParaEmitir } from "./provider";
import { destinatarioIe, observacaoDaTroca, validarParaEmitir, type RascunhoFiscal } from "./rascunho";
import { bloqueioDeProducao, escolherRegra, type OperacaoFiscal, type RegraFiscal, type TipoPessoa } from "./regras";

export type ResultadoEmissao =
  | { ok: true; id: string; status: string; rejeicao: { codigo: string | null; explicacao: string } | null }
  | { ok: false; code: "not_found" | "conflict" | "validation_failed" | "upstream_error"; message: string; erros?: string[] };

const falha = (code: Extract<ResultadoEmissao, { ok: false }>["code"], message: string, erros?: string[]): ResultadoEmissao =>
  ({ ok: false, code, message, erros });

interface DocFiscal {
  id: string; organization_id: string; operacao: OperacaoFiscal; status: string; numero: number | null;
  ref_provider: string | null; valor_total_cents: number; data_emissao: string; negociacao_id: string | null;
  veiculo_id: string | null; rascunho: RascunhoFiscal;
}

/** Erros que impedem emitir, sem enviar nada. Usado pela tela (para avisar antes) e pela emissão. */
export async function pendenciasDoDocumento(
  admin: SupabaseClient, org: string, doc: DocFiscal, ufLoja: string,
): Promise<{ erros: string[]; escolhida: ReturnType<typeof escolherRegra> }> {
  const r = doc.rascunho;
  const { data: regras } = await admin.from("regras_fiscais").select("*").eq("organization_id", org);
  const doc14 = r.pessoa.documento.length === 14;
  const tipoPessoa: TipoPessoa = doc14 ? "PJ_nao_contrib" : "PF";
  const escolhida = escolherRegra((regras ?? []) as RegraFiscal[], {
    operacao: doc.operacao, ufEmitente: ufLoja, ufContraparte: r.pessoa.uf || ufLoja, tipoPessoa, presencial: true,
  });

  let entradaAutorizada = false;
  let trocaEntradaNumero: number | null = null;
  if (doc.operacao === "SAI_VENDA") {
    if (doc.veiculo_id) {
      const { data: v } = await admin.from("veiculos").select("nfe_entrada_id").eq("id", doc.veiculo_id).eq("organization_id", org).maybeSingle();
      entradaAutorizada = Boolean(v?.nfe_entrada_id);
    }
    if (doc.negociacao_id && r.troca_placa) {
      const { data: t } = await admin.from("documentos_fiscais").select("numero, status").eq("organization_id", org)
        .eq("negociacao_id", doc.negociacao_id).eq("operacao", "ENT_TROCA").eq("status", "autorizada").maybeSingle();
      trocaEntradaNumero = t?.numero ?? null;
    }
  }
  const erros = validarParaEmitir({
    operacao: doc.operacao, rascunho: r, valorTotalCents: doc.valor_total_cents,
    entradaAutorizada, trocaEntradaNumero, temRegraAtiva: Boolean(escolhida),
  });
  return { erros, escolhida };
}

export async function emitirDocumento(
  admin: SupabaseClient, org: string, docId: string, userId: string,
): Promise<ResultadoEmissao> {
  const { data } = await admin.from("documentos_fiscais").select("*").eq("id", docId).eq("organization_id", org).maybeSingle();
  if (!data) return falha("not_found", "Nota não encontrada.");
  const doc = data as unknown as DocFiscal;
  if (doc.status !== "rascunho" && doc.status !== "rejeitada")
    return falha("conflict", "Só rascunho ou nota rejeitada pode ser emitida.");

  const carregada = await carregarConfigComContexto(admin, org);
  if (!carregada || !carregada.ctx) return falha("conflict", "Configure os dados fiscais da loja primeiro.");
  const { config: c, ctx } = carregada;
  const lista = montarChecklist(c as unknown as ConfigParaChecklist);
  if (!(ctx.ambiente === "producao" ? podeEmitir(lista) : podeEmitirNotaTeste(lista)))
    return falha("conflict", "Conclua a lista de configuração fiscal antes de emitir.");
  if (!c.logradouro || !c.numero || !c.bairro || !c.municipio || !c.cep)
    return falha("conflict", "Preencha o endereço da loja (rua, número, bairro, cidade e CEP).");

  const { erros, escolhida } = await pendenciasDoDocumento(admin, org, doc, String(c.uf));
  if (erros.length > 0 || !escolhida) return falha("validation_failed", erros[0] ?? "Há pendências na nota.", erros);
  const { regra } = escolhida;
  const bloqueio = bloqueioDeProducao(Number(c.crt), ctx.ambiente, regra);
  if (bloqueio) return falha("conflict", bloqueio);

  // Reserva a nota antes de gastar número: só um clique/requisição passa de rascunho/rejeitada para processando.
  const { data: reservada } = await admin.from("documentos_fiscais").update({ status: "processando", updated_at: new Date().toISOString() })
    .eq("id", doc.id).eq("organization_id", org).in("status", ["rascunho", "rejeitada"]).select("id").maybeSingle();
  if (!reservada) return falha("conflict", "Esta nota já está sendo emitida.");

  // Número: nota rejeitada reaproveita o dela; rascunho reserva o próximo.
  let numero = doc.numero;
  if (numero == null) {
    const prox = Number(c.proximo_numero_nfe);
    const { data: reservou } = await admin.from("config_fiscal_loja").update({ proximo_numero_nfe: prox + 1 })
      .eq("id", c.id as string).eq("organization_id", org).eq("proximo_numero_nfe", prox).select("id").maybeSingle();
    if (!reservou) {
      await admin.from("documentos_fiscais").update({ status: doc.status }).eq("id", doc.id).eq("organization_id", org);
      return falha("conflict", "A numeração mudou agora há pouco. Tente de novo.");
    }
    numero = prox;
  }
  const ref = doc.ref_provider ?? randomUUID();
  const serie = Number(c.serie_nfe);
  const agora = new Date().toISOString();
  const { error: eUp } = await admin.from("documentos_fiscais").update({
    status: "processando", numero, serie, ref_provider: ref, ambiente: ctx.ambiente, cfop: regra.cfop, updated_at: agora,
  }).eq("id", doc.id).eq("organization_id", org);
  if (eUp) return falha("upstream_error", "Não foi possível preparar a nota.");

  const r = doc.rascunho;
  const emitente: DadosEmpresa = {
    cnpj: String(c.cnpj), razaoSocial: String(c.razao_social), nomeFantasia: (c.nome_fantasia as string | null) ?? null,
    inscricaoEstadual: (c.inscricao_estadual as string | null) ?? null, inscricaoMunicipal: (c.inscricao_municipal as string | null) ?? null,
    crt: Number(c.crt), cnae: (c.cnae as string | null) ?? null, logradouro: String(c.logradouro), numero: String(c.numero),
    complemento: (c.complemento as string | null) ?? null, bairro: String(c.bairro), municipio: String(c.municipio),
    uf: String(c.uf), cep: String(c.cep), telefone: (c.telefone as string | null) ?? null, email: (c.email_contador as string | null) ?? null,
  };
  let infAd = regra.texto_inf_adic ?? "";
  if (doc.operacao === "SAI_VENDA" && r.troca_placa) {
    const { data: t } = await admin.from("documentos_fiscais").select("numero").eq("organization_id", org)
      .eq("negociacao_id", doc.negociacao_id!).eq("operacao", "ENT_TROCA").eq("status", "autorizada").maybeSingle();
    if (t?.numero != null) infAd = [infAd, observacaoDaTroca(r.troca_placa, t.numero)].filter(Boolean).join(" ");
  }
  const v = r.veiculo;
  const emissao: DocumentoParaEmitir = {
    ref, ambiente: ctx.ambiente, tipo: doc.operacao === "SAI_VENDA" ? 1 : 0, localDestino: escolhida.localDestino,
    finalidade: 1, consumidorFinal: true, presencaComprador: 1, naturezaOperacao: regra.natureza_operacao,
    dataEmissao: doc.data_emissao, serie, numero, emitente,
    destinatario: {
      nome: r.pessoa.nome, documento: r.pessoa.documento, ...destinatarioIe(r.pessoa),
      logradouro: r.pessoa.logradouro, numero: r.pessoa.numero, bairro: r.pessoa.bairro, municipio: r.pessoa.municipio,
      codigoMunicipio: r.pessoa.codigo_municipio, uf: r.pessoa.uf, cep: r.pessoa.cep,
    },
    itens: [{
      codigo: (v.placa ?? v.chassi ?? "VEICULO").toUpperCase(),
      descricao: [v.marca, v.modelo].filter(Boolean).join(" ").toUpperCase(),
      ncm: v.ncm!, cfop: regra.cfop, origem: 0, situacaoIcms: regra.csosn_ou_cst ?? "",
      aliquotaIcms: regra.aliq_icms, reducaoBcPct: regra.reducao_bc_pct, quantidade: 1,
      valorUnitarioCents: doc.valor_total_cents,
      informacoesAdicionais: infAdProdVeiculo({
        marca: v.marca, modelo: v.modelo, anoFabricacao: v.ano_fabricacao, anoModelo: v.ano_modelo, cor: v.cor,
        chassi: v.chassi, placa: v.placa, renavam: v.renavam, km: v.km,
      }),
      cstPis: regra.cst_pis, cstCofins: regra.cst_cofins,
      ibsCbs: regra.cst_ibscbs && regra.cclasstrib ? { cst: regra.cst_ibscbs, cClassTrib: regra.cclasstrib } : null,
    }],
    informacoesAdicionais: infAd || null,
    formaPagamento: doc.operacao === "SAI_VENDA" ? "99" : "90",
  };

  try {
    const res = await new FocusNfeProvider().emitirNfe(ctx, emissao);
    await aplicarResultado(admin, { id: doc.id, organization_id: org, status: "processando", rascunho: doc.rascunho }, res);
    return { ok: true, id: doc.id, status: res.status, rejeicao: res.rejeicao ? { codigo: res.rejeicao.codigo, explicacao: res.rejeicao.explicacao } : null };
  } catch {
    return falha("upstream_error", "O provedor fiscal não respondeu. A nota ficou em processamento; o sistema consulta sozinho.");
  }
}
