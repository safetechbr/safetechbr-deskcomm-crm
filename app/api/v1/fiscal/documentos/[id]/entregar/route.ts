/** POST envia o DANFE + XML da venda ao comprador (WhatsApp e/ou e-mail), mesmo se já enviado antes. */
import { type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { entregarAoComprador } from "@/lib/fiscal/entrega";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { guardaFiscal } from "@/lib/fiscal/rota";

export const dynamic = "force-dynamic";
const idSchema = z.string().uuid();

const MENSAGENS = {
  nao_encontrado: ["not_found", "Nota não encontrada.", 404],
  nao_autorizada: ["conflict", "Só a nota de venda autorizada pode ser enviada ao comprador.", 409],
  sem_contato: ["conflict", "O comprador não tem telefone nem e-mail cadastrado.", 409],
  falha_envio: ["upstream_error", "Não foi possível enviar agora. Confira o WhatsApp/e-mail da loja e tente de novo.", 502],
  ja_enviada: ["conflict", "Esta nota já foi enviada.", 409],
} as const;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const negado = await requireSupportWrite();
  if (negado) return negado;
  const g = await guardaFiscal("agent", false);
  if (!g.ok) return g.response;
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return fail("validation_failed", "Identificador inválido.", 422, { requestId: g.requestId });
  const r = await entregarAoComprador(g.admin, g.org, id.data, { forcar: true });
  if (!r.ok) {
    const [codigo, msg, status] = MENSAGENS[r.erro];
    return fail(codigo, msg, status, { requestId: g.requestId });
  }
  await audit({ organizationId: g.org, actorUserId: g.userId, action: "fiscal.entrega_comprador", resourceType: "documentos_fiscais", resourceId: id.data, requestId: g.requestId, metadata: { canais: r.enviados } });
  return ok({ enviados: r.enviados }, { requestId: g.requestId });
}
