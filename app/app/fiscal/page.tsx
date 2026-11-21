/** Notas fiscais da loja: lista com filtros. Papel mínimo `agent` para ver; emitir/cancelar exigem `manager` na rota. */
import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { ListaFiscal } from "./_lista";

export const metadata = { title: "Notas fiscais" };
export const dynamic = "force-dynamic";

export default async function FiscalDocumentosPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[org.role] < ROLE_RANK.agent) redirect("/403");
  return <ListaFiscal podeInutilizar={user.is_platform_admin || ROLE_RANK[org.role] >= ROLE_RANK.manager} />;
}
