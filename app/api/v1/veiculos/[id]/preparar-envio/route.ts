/**
 * POST /api/v1/veiculos/:id/preparar-envio — `{ conversation_id, modo, com_video? }`.
 *
 * NÃO envia. Copia as fotos (e o vídeo) do veículo para a pasta da conversa em
 * `whatsapp-media` e devolve a lista de mensagens prontas — o cliente as manda,
 * uma a uma, pelo MESMO `POST /api/v1/messages` de qualquer anexo. Assim janela
 * de 24 h, anti-ban de ritmo, permissão e histórico são os do Inbox, sem caminho
 * de envio paralelo. Qualquer papel que possa responder pode preparar.
 *
 * modo: completo (todas as fotos sem legenda, depois a ficha em mensagem de texto à parte) | fotos | ficha | preco.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  arquivoPertenceAoVeiculo,
  BUCKET_DAS_FOTOS_DE_VEICULO,
  BUCKET_DO_VIDEO_DE_VEICULO,
  COLUNAS_DO_VEICULO,
  fichaDoVeiculo,
  mimeDoArquivoDeVeiculo,
  tituloDoVeiculo,
  type Veiculo,
} from "@/lib/veiculos/regras";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  conversation_id: z.string().uuid(),
  modo: z.enum(["completo", "fotos", "ficha", "preco"]).default("completo"),
  com_video: z.boolean().default(false),
  /** Só devolve o texto da ficha (para o atendente conferir/editar); não copia mídia. */
  previa: z.boolean().default(false),
  /** Ficha já revisada pelo atendente: substitui o texto padrão. */
  texto: z.string().trim().min(1).max(4096).optional(),
});

export interface ItemDeEnvio {
  type: "text" | "image" | "video";
  body: string | null;
  media_storage_path?: string;
  media_mime?: string;
}

async function copiar(bucketOrigem: string, origem: string, destino: string): Promise<boolean> {
  const { error } = await createAdminClient()
    .storage.from(bucketOrigem)
    .copy(origem, destino, { destinationBucket: "whatsapp-media" });
  if (!error) return true;
  if (/already exists/i.test(error.message) || (error as { statusCode?: string }).statusCode === "409") return true;
  logger.warn("[veiculos/preparar-envio] cópia falhou", { detalhe: error.message.slice(0, 120) });
  return false;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "veiculos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const { id } = await params;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Dados inválidos."), 422, { requestId });
  const { conversation_id: conversaId, modo, com_video: comVideo, previa, texto } = parsed.data;

  const supabase = await createClient();
  const [{ data: v }, { data: conversa }] = await Promise.all([
    supabase.from("veiculos").select(COLUNAS_DO_VEICULO).eq("organization_id", orgId).eq("id", id).maybeSingle(),
    supabase.from("conversations").select("id").eq("organization_id", orgId).eq("id", conversaId).maybeSingle(),
  ]);
  if (!v) return fail("not_found", t("Veículo não encontrado."), 404, { requestId });
  if (!conversa) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  const veiculo = v as unknown as Veiculo;

  const ficha = texto ?? fichaDoVeiculo(veiculo, modo);
  if (previa) {
    return ok({ titulo: tituloDoVeiculo(veiculo), itens: [{ type: "text", body: ficha }], fotos_faltando: 0 }, { requestId });
  }
  const itens: ItemDeEnvio[] = [];
  let fotosFaltando = 0;

  if (modo === "ficha" || modo === "preco") {
    itens.push({ type: "text", body: ficha });
  } else {
    const deste = (veiculo.fotos ?? []).filter((c) => arquivoPertenceAoVeiculo(c, orgId, id));
    const fotos: ItemDeEnvio[] = [];
    for (const origem of deste) {
      const destino = `${orgId}/${conversaId}/veiculo-${origem.split("/").pop()}`;
      if (await copiar(BUCKET_DAS_FOTOS_DE_VEICULO, origem, destino)) {
        fotos.push({ type: "image", body: null, media_storage_path: destino, media_mime: mimeDoArquivoDeVeiculo(origem) });
      } else {
        fotosFaltando += 1;
      }
    }
    // Fotos primeiro e SEM legenda: enviadas em sequência, o WhatsApp as agrupa em
    // álbum (legenda na 1ª quebraria o grupo). A ficha vai por último, à parte.
    itens.push(...fotos);

    if (comVideo && veiculo.video && arquivoPertenceAoVeiculo(veiculo.video, orgId, id, "video")) {
      const destino = `${orgId}/${conversaId}/veiculo-${veiculo.video.split("/").pop()}`;
      if (await copiar(BUCKET_DO_VIDEO_DE_VEICULO, veiculo.video, destino)) {
        itens.push({ type: "video", body: null, media_storage_path: destino, media_mime: "video/mp4" });
      }
    }
    if (modo === "completo") itens.push({ type: "text", body: ficha });
  }

  await audit({
    organizationId: orgId,
    actorUserId: authz.user.id,
    action: "veiculo.presented",
    resourceType: "veiculos",
    resourceId: id,
    requestId,
    metadata: { conversation_id: conversaId, modo },
  });

  return ok({ titulo: tituloDoVeiculo(veiculo), itens, fotos_faltando: fotosFaltando }, { requestId });
}
