import type { Metadata } from "next";
import { EmBreve } from "@/components/shell/EmBreve";
import { requireAuth } from "@/lib/auth/server";
import { Receipt } from "@/lib/ui/icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Movimentações" };

export default async function Page() {
  await requireAuth();
  return <EmBreve titulo="Movimentações" icone={<Receipt size={28} weight="duotone" aria-hidden />} />;
}
