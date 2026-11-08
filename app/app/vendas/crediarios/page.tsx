import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { roleAtLeast } from "@/lib/auth/types";
import { CrediariosClient } from "./_client";
export const dynamic = "force-dynamic";
export const metadata = { title: "Crediários" };
export default async function Page() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  return (
    <CrediariosClient
      podeReceber={roleAtLeast(org?.role, "agent")}
      podeEditar={roleAtLeast(org?.role, "manager")}
    />
  );
}
