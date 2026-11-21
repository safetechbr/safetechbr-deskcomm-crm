/** GET baixa o xml da nota. */
import { type NextRequest } from "next/server";
import { baixarArquivo } from "@/lib/fiscal/arquivo";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return baixarArquivo((await params).id, "xml");
}
