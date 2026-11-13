import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail } from "@/lib/api/wrappers";
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; documentId: string }> },
) {
  const requestId = randomUUID();
  const a = await requireRole("agent", { requestId, resource: "contacts" });
  if (!a.ok) return a.response;
  const p = z
    .object({ id: z.string().uuid(), documentId: z.string().uuid() })
    .safeParse(await ctx.params);
  if (!p.success) return fail("invalid_request", "Documento inválido.", 400, { requestId });
  const db = await createClient();
  const org = a.org.orgId;
  const { data: c } = await db
    .from("contacts")
    .select("id,is_anonymized")
    .eq("id", p.data.id)
    .eq("organization_id", org)
    .maybeSingle();
  if (!c || c.is_anonymized)
    return fail("not_found", "Cliente não encontrado.", 404, { requestId });
  const { data: d } = await db
    .from("contact_documents")
    .select("storage_path")
    .eq("id", p.data.documentId)
    .eq("contact_id", c.id)
    .eq("organization_id", org)
    .maybeSingle();
  if (!d || !d.storage_path.startsWith(`${org}/contacts/${c.id}/`))
    return fail("not_found", "Documento não encontrado.", 404, { requestId });
  const { data, error } = await createAdminClient()
    .storage.from("client-documents")
    .createSignedUrl(d.storage_path, 60);
  if (error || !data)
    return fail("internal_error", "Não foi possível abrir o documento.", 500, { requestId });
  return new Response(null, {
    status: 302,
    headers: {
      Location: data.signedUrl,
      "Cache-Control": "private, no-store",
      "X-Request-Id": requestId,
    },
  });
}
