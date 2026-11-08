import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/server";

/** A tela inicial é o Dashboard; o logo da barra volta para ela. */
export default async function AppHome() {
  await requireAuth();
  redirect("/app/dashboard");
}
