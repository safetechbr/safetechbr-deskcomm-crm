import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { reservaDeVeiculoSchema } from "@/lib/veiculos/reservas";

export const dynamic = "force-dynamic";

async function executar(req: NextRequest, params: Promise<{ id: string }>, liberar: boolean) {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "veiculos" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const body: unknown = await req.json().catch(() => null);
  const schema = liberar ? z.object({ reserva_id: z.string().uuid() }) : reservaDeVeiculoSchema;
  const parsed = schema.safeParse(body);
  if (!z.string().uuid().safeParse(id).success || !parsed.success)
    return fail("validation_failed", "Dados da reserva inválidos.", 422, { requestId });
  const db = await createClient();
  // Client de sessão: mantém também o escopo da conversa na entrada pela central.
  if ("conversation_id" in parsed.data) {
    const { data, error } = await db.from("conversations").select("id")
      .eq("organization_id", authz.org.orgId).eq("id", parsed.data.conversation_id).maybeSingle();
    if (error) return fail("internal_error", "Não foi possível conferir a conversa.", 500, { requestId });
    if (!data) return fail("not_found", "Conversa não encontrada.", 404, { requestId });
  }
  const args = "reserva_id" in parsed.data
    ? { p_org: authz.org.orgId, p_veiculo: id, p_reserva: parsed.data.reserva_id }
    : { p_org: authz.org.orgId, p_veiculo: id, p_conversa: parsed.data.conversation_id,
      p_horas: parsed.data.duracao_horas, p_visita: parsed.data.visita_em ?? null };
  const { data, error } = await db.rpc(liberar ? "fn_liberar_reserva_veiculo" : "fn_reservar_veiculo", args);
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "PT409" ? 409 : error.code === "PT422" ? 422 : 500;
    const code = status === 403 ? "forbidden" : status === 404 ? "not_found" : status === 409 ? "conflict" : status === 422 ? "validation_failed" : "internal_error";
    return fail(code, status === 500 ? "Não foi possível salvar a reserva." : error.message, status, { requestId });
  }
  await audit({ organizationId: authz.org.orgId, actorUserId: authz.user.id,
    action: liberar ? "veiculo.reserva_liberada" : "veiculo.reservado", resourceType: "veiculos", resourceId: id,
    requestId, metadata: parsed.data });
  return ok(data, { requestId });
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  return executar(req, params, false);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  return executar(req, params, true);
}
