import type { SupabaseClient } from "@supabase/supabase-js";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import { ApiError } from "@/lib/api/types";
import type { ContactCreate, ContactPatch } from "@/lib/schemas/contacts";
import type { Contact } from "@/lib/types/contacts";
import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import { hashCpf } from "@/lib/contacts/cpf";

/** Reaproveita a identidade; não funde registros nem recria conversas. */
export async function atualizarCadastroManual(
  db: SupabaseClient, ctx: HandlerCtx, input: ContactCreate,
  atualizar: (db: SupabaseClient, ctx: HandlerCtx, id: string, patch: ContactPatch) => Promise<Contact>,
): Promise<Contact | null> {
  if (!input.reuse_existing_phone || ctx.actor.type !== "user" || input.source !== "manual" || !input.phone_number) return null;
  const {data, error} = await db.from("contacts")
    .select("id, cpf_hash, is_anonymized, contact_type, tags")
    .eq("organization_id", ctx.organization_id).eq("kind", "person")
    .in("phone_number", phoneLookupVariants(input.phone_number)).is("is_merged_into", null).limit(3);
  if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId);
  if (!data?.length) return null;
  const existente = data[0];
  if (!existente) return null;
  if (data.length !== 1 || existente.is_anonymized || input.cpf && existente.cpf_hash && hashCpf(input.cpf) !== existente.cpf_hash
    || input.contact_type && existente.contact_type && input.contact_type !== existente.contact_type)
    throw new ApiError(409, "contact_exists", data.length === 1 ? { contact_id: existente.id } : undefined, ctx.requestId, "O telefone corresponde a um cadastro com dados divergentes. Revise o contato existente antes de associar o cliente.");
  const patch: ContactPatch = {};
  // Campo ausente/vazio não apaga informação anterior. Origem, bloqueios,
  // consentimentos, etiquetas e identidades dos canais ficam no mesmo registro.
  if (input.name?.trim()) patch.name = input.name.trim();
  if (input.email?.trim()) patch.email = input.email.trim();
  if (input.birthdate) patch.birthdate = input.birthdate;
  if (input.cpf) patch.cpf = input.cpf;
  if (input.tags?.length) patch.tags = [...new Set([...(existente.tags ?? []), ...input.tags])];
  return atualizar(db, ctx, existente.id, patch);
}
