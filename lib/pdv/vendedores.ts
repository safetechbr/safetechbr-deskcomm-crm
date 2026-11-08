/**
 * Vendedores do PDV = membros ativos da organização que podem vender (agent+).
 * A mesma regra do `GET /api/v1/team/assignable`, usada aqui para a rota
 * recusar um `vendedor_user_id` de fora da organização.
 */
import { isServiceRoleConfigured } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function vendedorEhDaOrganizacao(orgId: string, userId: string): Promise<boolean> {
  // A RLS esconde os outros membros de um agent: com service role, filtrando
  // pela org confiável (cookie validado), como na rota de assignable.
  const client = isServiceRoleConfigured() ? createAdminClient() : await createClient();
  const { data } = await client
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .neq("role", "viewer")
    .maybeSingle();
  return Boolean(data);
}
