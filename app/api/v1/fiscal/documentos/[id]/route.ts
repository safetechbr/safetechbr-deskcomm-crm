/** GET detalhe da nota (com eventos) · PATCH edita o rascunho (só rascunho ou rejeitada). */
import { type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { pendenciasDoDocumento } from "@/lib/fiscal/emitir";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { guardaFiscal } from "@/lib/fiscal/rota";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const g = await guardaFiscal("agent", false);
  if (!g.ok) return g.response;
  const { id } = await params;
  const { data: doc } = await g.admin.from("documentos_fiscais")
    .select("id, operacao, tipo, status, numero, serie, chave, protocolo, valor_total_cents, data_emissao, ambiente, cfop, motivo_rejeicao, veiculo_id, negociacao_id, rascunho, autorizada_em, xml_url, pdf_url, renave_status, renave_enviado_em, entrega_enviada_em, created_at")
    .eq("id", id).eq("organization_id", g.org).maybeSingle();
  if (!doc) return fail("not_found", "Nota não encontrada.", 404, { requestId: g.requestId });
  const { data: eventos } = await g.admin.from("documento_fiscal_eventos")
    .select("id, tipo, sequencia, texto, protocolo, status, data").eq("documento_id", id).eq("organization_id", g.org).order("data");
  const { data: cfg } = await g.admin.from("config_fiscal_loja").select("uf").eq("organization_id", g.org).maybeSingle();
  const pend = doc.status === "rascunho" || doc.status === "rejeitada"
    ? await pendenciasDoDocumento(g.admin, g.org, doc as never, String(cfg?.uf ?? "PI"))
    : { erros: [] as string[] };
  return ok({ ...doc, eventos: eventos ?? [], pendencias: pend.erros }, { requestId: g.requestId });
}

const texto = z.string().trim().max(200).nullable().optional();
const corpo = z.object({
  pessoa: z.object({
    nome: texto, documento: texto, logradouro: texto, numero: texto, bairro: texto, municipio: texto,
    codigo_municipio: texto, uf: texto, cep: texto, email: texto,
  }).partial().optional(),
  veiculo: z.object({
    marca: texto, modelo: texto, cor: texto, chassi: texto, placa: texto, renavam: texto, ncm: texto,
    ano_fabricacao: z.number().int().nullable().optional(), ano_modelo: z.number().int().nullable().optional(),
    km: z.number().int().nullable().optional(),
  }).partial().optional(),
}).strict();

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const negado = await requireSupportWrite();
  if (negado) return negado;
  const g = await guardaFiscal("manager", false);
  if (!g.ok) return g.response;
  const { id } = await params;
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Dados inválidos.", 422, { requestId: g.requestId });
  const { data: doc } = await g.admin.from("documentos_fiscais").select("status, rascunho").eq("id", id).eq("organization_id", g.org).maybeSingle();
  if (!doc) return fail("not_found", "Nota não encontrada.", 404, { requestId: g.requestId });
  if (doc.status !== "rascunho" && doc.status !== "rejeitada")
    return fail("conflict", "Só dá para editar rascunho ou nota rejeitada.", 409, { requestId: g.requestId });
  const r = doc.rascunho as { pessoa: object; veiculo: object };
  const limpo = (o: object | undefined) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined));
  const novo = { ...r, pessoa: { ...r.pessoa, ...limpo(parsed.data.pessoa) }, veiculo: { ...r.veiculo, ...limpo(parsed.data.veiculo) } };
  const { error } = await g.admin.from("documentos_fiscais").update({ rascunho: novo, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", g.org);
  if (error) return fail("internal_error", "Erro ao salvar.", 500, { requestId: g.requestId });
  await audit({ organizationId: g.org, actorUserId: g.userId, action: "fiscal.documento_editado", resourceType: "documentos_fiscais", resourceId: id, requestId: g.requestId, metadata: {} });
  return ok({ id }, { requestId: g.requestId });
}
