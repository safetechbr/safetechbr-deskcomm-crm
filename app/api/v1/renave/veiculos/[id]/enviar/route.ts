/**
 * POST /api/v1/renave/veiculos/:id/enviar — envia um veículo ao RENAVE, sob
 * demanda e um por vez (regra LGPD da integradora: nada de sync em massa).
 *
 * A outra parte (vendedor na compra, comprador na venda) e o valor vêm da
 * negociação no banco, nunca do corpo. Sem `negociacao_id`, usa a negociação
 * mais recente não cancelada do carro. Sem `chave_nfe`, usa a NF-e ligada ao
 * veículo (entrada na compra, saída na venda), se houver.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { chaveDaRequisicao, comIdempotencia } from "@/lib/api/idempotency";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { enviarVeiculo, type ResultadoEnvio } from "@/lib/renave/servico";
import { chaveNfeValida, soDigitos } from "@/lib/renave/validacao";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ENDPOINT = "POST /api/v1/renave/veiculos/:id/enviar";

const schema = z.object({
  operacao: z.enum(["compra", "venda"]),
  negociacao_id: z.string().uuid().optional(),
  chave_nfe: z.string().transform(soDigitos).refine(chaveNfeValida, "Chave da NF-e inválida.").optional(),
});

type Negociacao = {
  id: string; tipo: string; veiculo_id: string | null; troca_veiculo_id: string | null;
  cliente: Record<string, unknown> | null; valor_cents: number; desconto_cents: number;
  troca: { valor_cents?: number } | null;
};
const COLUNAS_NEG = "id, tipo, veiculo_id, troca_veiculo_id, cliente, valor_cents, desconto_cents, troca";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "renave" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("validation_failed", "Veículo inválido.", 422, { requestId });
  const chave = chaveDaRequisicao(req);
  if (chave !== null && !z.string().uuid().safeParse(chave).success)
    return fail("validation_error", "Idempotency-Key deve ser UUID", 400, { requestId });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_failed", parsed.error.issues[0]?.message ?? "Dados inválidos.", 422, { requestId });
  const d = parsed.data;
  const org = authz.org.orgId;
  const admin = createAdminClient();

  const { data: veiculo } = await admin.from("veiculos").select("id, nfe_entrada_id, nfe_saida_id")
    .eq("organization_id", org).eq("id", id).maybeSingle();
  if (!veiculo) return fail("not_found", "Veículo não encontrado.", 404, { requestId });

  // Negociação: a informada (tem de citar este carro) ou a mais recente.
  let q = admin.from("negociacoes_de_veiculo").select(COLUNAS_NEG).eq("organization_id", org).neq("status", "cancelada");
  q = d.negociacao_id ? q.eq("id", d.negociacao_id)
    : d.operacao === "venda" ? q.eq("tipo", "venda").eq("veiculo_id", id)
    : q.or(`and(tipo.eq.compra,veiculo_id.eq.${id}),and(tipo.eq.venda,troca_veiculo_id.eq.${id})`);
  const { data: negs } = await q.order("created_at", { ascending: false }).limit(1);
  const neg = (negs?.[0] ?? null) as Negociacao | null;
  if (!neg) return fail("validation_failed", "Nenhuma negociação deste carro foi encontrada para enviar ao RENAVE.", 422, { requestId });
  const ehTroca = neg.tipo === "venda" && neg.troca_veiculo_id === id;
  const casa = d.operacao === "venda" ? neg.tipo === "venda" && neg.veiculo_id === id
    : (neg.tipo === "compra" && neg.veiculo_id === id) || ehTroca;
  if (!casa) return fail("validation_failed", "Esta negociação não corresponde a este carro e operação.", 422, { requestId });
  const valorCents = d.operacao === "venda" ? Math.max(0, neg.valor_cents - neg.desconto_cents)
    : ehTroca ? Number(neg.troca?.valor_cents ?? 0) : neg.valor_cents;

  let chaveNfe = d.chave_nfe ?? null;
  const nfeId = d.operacao === "compra" ? veiculo.nfe_entrada_id : veiculo.nfe_saida_id;
  if (!chaveNfe && nfeId) {
    const { data: doc } = await admin.from("documentos_fiscais").select("chave")
      .eq("organization_id", org).eq("id", nfeId).maybeSingle();
    chaveNfe = (doc?.chave as string | null) ?? null;
  }

  const enviar = async () => {
    const r = await enviarVeiculo(admin, org, id, d.operacao, { chaveNfe, valorCents, cliente: neg.cliente });
    if (r.ok) {
      await audit({ organizationId: org, actorUserId: authz.user.id, action: "renave.veiculo_enviado",
        resourceType: "veiculos", resourceId: id, requestId,
        metadata: { operacao: d.operacao, negociacao_id: neg.id, com_nfe: Boolean(chaveNfe), troca: ehTroca } });
    }
    return r;
  };

  const desfecho = chave === null
    ? { tipo: "executou" as const, resposta: await enviar(), status: 200 }
    : await comIdempotencia<ResultadoEnvio>({
        db: await createClient(), organizationId: org, endpoint: ENDPOINT, chave,
        corpo: { veiculo_id: id, ...d }, executar: async () => ({ resposta: await enviar(), status: 200 }),
      });
  if (desfecho.tipo === "conflito")
    return fail("idempotency_conflict", "Esta chave de idempotência já foi usada com outro conteúdo.", 409, { requestId });
  if (desfecho.tipo === "em_curso")
    return fail("idempotency_in_progress", "Este envio ainda está em andamento.", 409, { requestId });
  const r = desfecho.resposta;
  if (!r.ok && r.pendencias.length > 0)
    return fail("validation_failed", "Faltam dados para enviar ao RENAVE.", 422, { requestId, details: { pendencias: r.pendencias } });
  if (!r.ok) return fail("upstream_error", r.erro ?? "Não foi possível enviar ao RENAVE.", 502, { requestId });
  return ok(r, { requestId });
}
