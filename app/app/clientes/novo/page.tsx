import type { Metadata } from "next";

import { NovoClienteClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Adicionar Cliente" };

export default function NovoClientePage() {
  return <NovoClienteClient />;
}
