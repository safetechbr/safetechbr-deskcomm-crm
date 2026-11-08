import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { operacaoCrediarioSchema } from "@/lib/pdv/crediario";
import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const support = await requireSupportWrite();
  if (support) return support;
  const input = operacaoCrediarioSchema.safeParse(await req.json().catch(() => null));
  const id = z
    .string()
    .uuid()
    .safeParse((await ctx.params).id);
  if (!input.success || !id.success)
    return fail("validation_failed", "Confira os dados da parcela.", 422, { requestId });
  const auth = await requireRole(input.data.operacao === "receber" ? "agent" : "manager", {
    requestId,
    resource: "negociacoes_de_veiculo",
  });
  if (!auth.ok) return auth.response;
  const db = await createClient();
  const { data: venda } = await db
    .from("negociacoes_de_veiculo")
    .select("id")
    .eq("organization_id", auth.org.orgId)
    .eq("id", id.data)
    .maybeSingle();
  if (!venda) return fail("not_found", "Crediário não encontrado.", 404, { requestId });
  const { error } = await db.rpc("fn_pdv_crediario_operar", {
    p_id: id.data,
    p_operacao: input.data.operacao,
    p_dados: input.data,
  });
  if (error)
    return fail(
      error.code === "42501" ? "forbidden" : "validation_failed",
      error.code === "42501"
        ? "Sem permissão para alterar o crediário."
        : "Não foi possível alterar a parcela. Atualize a tela e confira os valores e vencimentos.",
      error.code === "42501" ? 403 : 422,
      { requestId },
    );
  await audit({
    action: "negociacao_veiculo.crediario_updated",
    actorUserId: auth.user.id,
    organizationId: auth.org.orgId,
    resourceType: "negociacoes_de_veiculo",
    resourceId: id.data,
    metadata: { operacao: input.data.operacao },
    requestId,
  });
  return ok({ id: id.data }, { requestId });
}
