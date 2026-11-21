import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { DetalheFiscal } from "./_detalhe";

export const metadata = { title: "Nota fiscal" };
export const dynamic = "force-dynamic";

export default async function NotaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[org.role] < ROLE_RANK.agent) redirect("/403");
  return <DetalheFiscal id={(await params).id} podeAgir={user.is_platform_admin || ROLE_RANK[org.role] >= ROLE_RANK.manager} />;
}
