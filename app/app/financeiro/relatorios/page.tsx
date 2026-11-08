import type { Metadata } from "next";
import { EmBreve } from "@/components/shell/EmBreve";
import { requireAuth } from "@/lib/auth/server";
import { ChartBar } from "@/lib/ui/icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Relatórios" };

export default async function Page() {
  await requireAuth();
  return <EmBreve titulo="Relatórios" icone={<ChartBar size={28} weight="duotone" aria-hidden />} />;
}
