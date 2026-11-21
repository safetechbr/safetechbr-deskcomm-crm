/**
 * POST /api/v1/fiscal/nota-teste — emite uma NF-e de teste em HOMOLOGAÇÃO.
 * Sem valor fiscal. Quando a SEFAZ autoriza (aqui, no webhook ou no cron de
 * consulta), `nota_teste_ok_em` é preenchido e a produção pode ser ligada.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { aplicarResultado } from "@/lib/fiscal/aplicar-resultado";
import { montarChecklist, podeEmitirNotaTeste, type ConfigParaChecklist } from "@/lib/fiscal/checklist";
import { carregarConfigComContexto } from "@/lib/fiscal/config-servidor";
import { FocusNfeProvider } from "@/lib/fiscal/focus/provider";
import type { DadosEmpresa, DocumentoParaEmitir } from "@/lib/fiscal/provider";
import { escolherRegra, type RegraFiscal } from "@/lib/fiscal/regras";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const VALOR_CENTS = 100;
// CPF de teste com dígitos verificadores válidos; a SEFAZ de homologação troca o nome do destinatário.
const CPF_TESTE = "11144477735";

export async function POST(_req: NextRequest) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fiscal" });
  if (!authz.ok) return authz.response;
  const org = authz.org.orgId;
  const admin = createAdminClient();

  const carregada = await carregarConfigComContexto(admin, org);
  if (!carregada) return fail("conflict", "Configure os dados fiscais da loja primeiro.", 409, { requestId });
  const { config: c, ctx } = carregada;
  if (!podeEmitirNotaTeste(montarChecklist(c as unknown as ConfigParaChecklist)) || !ctx)
    return fail("conflict", "Conclua os itens 1 a 5 da lista antes da nota de teste.", 409, { requestId });
  if (!c.logradouro || !c.numero || !c.bairro || !c.municipio || !c.cep)
    return fail("conflict", "Preencha o endereço da loja (rua, número, bairro, cidade e CEP).", 409, { requestId });

  const { data: regras } = await admin.from("regras_fiscais").select("*").eq("organization_id", org);
  const escolhida = escolherRegra((regras ?? []) as RegraFiscal[], {
    operacao: "SAI_VENDA", ufEmitente: String(c.uf), ufContraparte: String(c.uf), tipoPessoa: "PF", presencial: true,
  });
  if (!escolhida) return fail("conflict", "Não há regra fiscal ativa para venda a pessoa física.", 409, { requestId });
  const { regra } = escolhida;

  // Reserva o número só se ninguém o tomou entre a leitura e a escrita.
  const numero = Number(c.proximo_numero_nfe);
  const { data: reservou } = await admin.from("config_fiscal_loja").update({ proximo_numero_nfe: numero + 1 })
    .eq("id", c.id as string).eq("organization_id", org).eq("proximo_numero_nfe", numero).select("id").maybeSingle();
  if (!reservou) return fail("conflict", "A numeração mudou agora há pouco. Tente de novo.", 409, { requestId });

  const ref = randomUUID();
  const serie = Number(c.serie_nfe);
  const agora = new Date().toISOString();
  const { data: doc, error: errDoc } = await admin.from("documentos_fiscais").insert({
    organization_id: org, modelo: "55", operacao: "SAI_VENDA", tipo: "saida", finalidade: "normal",
    status: "processando", numero, serie, ref_provider: ref, ambiente: "homologacao", data_emissao: agora,
    valor_total_cents: VALOR_CENTS, cfop: regra.cfop, rascunho: { teste: true }, created_by: authz.user.id,
  }).select("id, organization_id, status, rascunho").single();
  if (errDoc || !doc) {
    logger.error("[fiscal/nota-teste] insert falhou", { error: errDoc?.message, requestId });
    return fail("internal_error", "Não foi possível criar a nota de teste.", 500, { requestId });
  }

  const emitente: DadosEmpresa = {
    cnpj: String(c.cnpj), razaoSocial: String(c.razao_social), nomeFantasia: (c.nome_fantasia as string | null) ?? null,
    inscricaoEstadual: (c.inscricao_estadual as string | null) ?? null, inscricaoMunicipal: (c.inscricao_municipal as string | null) ?? null,
    crt: Number(c.crt), cnae: (c.cnae as string | null) ?? null, logradouro: String(c.logradouro), numero: String(c.numero),
    complemento: (c.complemento as string | null) ?? null, bairro: String(c.bairro), municipio: String(c.municipio),
    uf: String(c.uf), cep: String(c.cep), telefone: (c.telefone as string | null) ?? null, email: (c.email_contador as string | null) ?? null,
  };
  const emissao: DocumentoParaEmitir = {
    ref, ambiente: "homologacao", tipo: 1, localDestino: escolhida.localDestino, finalidade: 1,
    consumidorFinal: true, presencaComprador: 1, naturezaOperacao: regra.natureza_operacao,
    dataEmissao: agora, serie, numero, emitente,
    destinatario: {
      nome: "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL", documento: CPF_TESTE, indicadorIe: 9,
      inscricaoEstadual: null, logradouro: emitente.logradouro!, numero: emitente.numero!, bairro: emitente.bairro!,
      municipio: emitente.municipio!, codigoMunicipio: null, uf: emitente.uf, cep: emitente.cep!,
    },
    itens: [{
      codigo: "TESTE", descricao: "NOTA DE TESTE SEM VALOR FISCAL", ncm: "87030000", cfop: regra.cfop, origem: 0,
      situacaoIcms: regra.csosn_ou_cst ?? "", aliquotaIcms: regra.aliq_icms, reducaoBcPct: regra.reducao_bc_pct,
      quantidade: 1, valorUnitarioCents: VALOR_CENTS, informacoesAdicionais: "Nota de teste em homologação.",
      cstPis: regra.cst_pis, cstCofins: regra.cst_cofins,
      ibsCbs: regra.cst_ibscbs && regra.cclasstrib ? { cst: regra.cst_ibscbs, cClassTrib: regra.cclasstrib } : null,
    }],
    informacoesAdicionais: regra.texto_inf_adic, formaPagamento: "99",
  };

  let status: string;
  try {
    const r = await new FocusNfeProvider().emitirNfe(ctx, emissao);
    await aplicarResultado(admin, doc, r);
    status = r.status;
    if (r.rejeicao) return ok({ id: doc.id, status, rejeicao: r.rejeicao }, { requestId });
  } catch (e) {
    logger.error("[fiscal/nota-teste] emissão falhou", { error: e instanceof Error ? e.message : "erro", requestId });
    return fail("upstream_error", "O provedor fiscal não respondeu. A nota ficou em processamento.", 502, { requestId });
  }
  await audit({ organizationId: org, actorUserId: authz.user.id, action: "fiscal.nota_teste_emitida",
    resourceType: "documentos_fiscais", resourceId: doc.id as string, requestId, metadata: { status, numero } });
  return ok({ id: doc.id, status }, { requestId });
}
