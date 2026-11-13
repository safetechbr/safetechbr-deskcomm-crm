import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { assinaturaDoDocumento } from "@/lib/contacts/documentos";
const params = z.object({ id: z.string().uuid() });
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: Ctx) {
  const requestId = randomUUID();
  const a = await requireRole("agent", { requestId, resource: "contacts" });
  if (!a.ok) return a.response;
  const p = params.safeParse(await ctx.params);
  if (!p.success) return fail("invalid_request", "Cliente inválido.", 400, { requestId });
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
  const { data, error } = await db
    .from("contact_documents")
    .select("id,kind,file_name,created_at")
    .eq("contact_id", c.id)
    .eq("organization_id", org)
    .order("created_at");
  if (error)
    return fail("internal_error", "Não foi possível listar documentos.", 500, { requestId });
  return ok({ files: data ?? [] }, { requestId });
}
export async function POST(req: Request, ctx: Ctx) {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const a = await requireRole("agent", { requestId, resource: "contacts" });
  if (!a.ok) return a.response;
  const p = params.safeParse(await ctx.params);
  if (!p.success) return fail("invalid_request", "Cliente inválido.", 400, { requestId });
  if (Number(req.headers.get("content-length")) > 11 * 1024 * 1024)
    return fail("payload_too_large", "Envie até 10 MB.", 413, { requestId });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = z.enum(["identidade", "residencia"]).safeParse(form?.get("kind"));
  if (!(file instanceof File) || !kind.success || !file.size || file.size > 10485760)
    return fail("invalid_request", "Documento inválido ou maior que 10 MB.", 422, { requestId });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = assinaturaDoDocumento(bytes);
  if (!mime)
    return fail("invalid_request", "Envie foto JPG, PNG, WebP ou PDF.", 422, { requestId });
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
  const id = randomUUID();
  const path = `${org}/contacts/${c.id}/${id}`;
  const storage = createAdminClient().storage.from("client-documents");
  const { error: up } = await storage.upload(path, bytes, { contentType: mime, upsert: false });
  if (up)
    return fail(
      "internal_error",
      "Não foi possível armazenar o documento. Tente salvar novamente.",
      500,
      { requestId },
    );
  const { data, error } = await db
    .from("contact_documents")
    .insert({
      id,
      organization_id: org,
      contact_id: c.id,
      kind: kind.data,
      file_name: file.name.slice(0, 200),
      file_size: file.size,
      mime_type: mime,
      storage_path: path,
      created_by: a.user.id,
    })
    .select("id,kind,file_name,created_at")
    .single();
  if (error) {
    await storage.remove([path]);
    return fail("internal_error", "Não foi possível vincular o documento. Tente novamente.", 500, {
      requestId,
    });
  }
  await audit({
    action: "contact.updated",
    resourceType: "contacts",
    resourceId: c.id,
    requestId,
    metadata: { document_id: id, kind: kind.data },
  });
  return ok({ file: data }, { status: 201, requestId });
}
