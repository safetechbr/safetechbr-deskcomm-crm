/** POST gera (e envia ao contador, se houver e-mail) o pacote de qualquer mês: { competencia: "YYYY-MM" }. */
import { type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { gerarPacoteMensal } from "@/lib/fiscal/pacote-mensal";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { guardaFiscal } from "@/lib/fiscal/rota";

export const dynamic = "force-dynamic";
const corpo = z.object({ competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).strict();

const MENSAGENS = {
  competencia_invalida: ["validation_failed", "Mês inválido.", 422],
  sem_config: ["conflict", "Configure a empresa em Fiscal antes.", 409],
  sem_notas: ["not_found", "Não há notas autorizadas nesse mês.", 404],
  falha_gravacao: ["internal_error", "Não foi possível gerar o pacote agora.", 500],
  email_nao_configurado: ["conflict", "O envio de e-mail não está configurado na plataforma.", 409],
} as const;

export async function POST(req: NextRequest) {
  const negado = await requireSupportWrite();
  if (negado) return negado;
  const g = await guardaFiscal("manager", false);
  if (!g.ok) return g.response;
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Informe o mês (AAAA-MM).", 422, { requestId: g.requestId });
  const r = await gerarPacoteMensal(g.admin, g.org, parsed.data.competencia, { enviar: true });
  if (!r.ok) {
    const [codigo, msg, status] = MENSAGENS[r.erro];
    return fail(codigo, msg, status, { requestId: g.requestId });
  }
  await audit({ organizationId: g.org, actorUserId: g.userId, action: "fiscal.pacote_mensal", resourceType: "fiscal_pacotes_mensais", resourceId: null, requestId: g.requestId, metadata: { competencia: parsed.data.competencia, qtd_notas: r.qtdNotas, enviado_para: r.enviadoPara } });
  return ok({ qtdNotas: r.qtdNotas, enviadoPara: r.enviadoPara }, { requestId: g.requestId });
}
