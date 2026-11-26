import { z } from "zod";

/**
 * Laudo de vistoria e estado do veículo (Anexo I do contrato de venda).
 * Os dados ficam em `contrato.vistoria` (jsonb); vendas antigas, sem eles,
 * continuam com o anexo simples de `contrato.estado_veiculo`.
 */

const texto = z.string().trim().max(300).default("");

/** B = bom, D = desgaste natural de uso, A = avaria, NV = não verificado. */
export const SITUACOES = [
  ["B", "Bom"],
  ["D", "Desgaste natural"],
  ["A", "Avaria"],
  ["NV", "Não verificado"],
] as const;
export type SituacaoDoItem = (typeof SITUACOES)[number][0];

export const CONFERENCIAS = [
  ["confere", "Confere"],
  ["divergente", "Divergente"],
] as const;

/** Itens conferidos, agrupados como saem na tabela do laudo. */
export const ITENS_DA_VISTORIA = [
  ["lataria", "Externo", "Lataria e pintura"],
  ["vidros", "Externo", "Vidros, para-brisa e retrovisores"],
  ["iluminacao", "Externo", "Faróis, lanternas e setas"],
  ["pneus", "Externo", "Pneus e rodas"],
  ["estepe", "Externo", "Estepe, macaco e chave de roda"],
  ["interior", "Interno", "Bancos, forros e tapetes"],
  ["painel", "Interno", "Painel, instrumentos e luzes de alerta"],
  ["ar", "Interno", "Ar-condicionado e ventilação"],
  ["eletrica", "Interno", "Vidros elétricos, travas, som e buzina"],
  ["motor", "Mecânico", "Motor (partida, ruídos, vazamentos)"],
  ["cambio", "Mecânico", "Câmbio e embreagem"],
  ["freios", "Mecânico", "Freios"],
  ["suspensao", "Mecânico", "Suspensão e direção"],
  ["itens", "Documentos e acessórios", "Itens e acessórios (manual, chave reserva, triângulo)"],
] as const;
export type ItemDaVistoria = (typeof ITENS_DA_VISTORIA)[number][0];

/** Sulco mínimo legal dos pneus (Res. CONTRAN 558/1980). */
export const SULCO_MINIMO_MM = 1.6;

const conferencia = z.enum(["confere", "divergente"]).optional();
const situacaoDoItem = z
  .object({
    estado: z.enum(["B", "D", "A", "NV"]).optional(),
    /** Descrição da avaria ou observação livre. */
    obs: texto,
    /** Obrigatória quando o item não foi verificado. */
    justificativa: texto,
  })
  .partial();

export const vistoriaSchema = z
  .object({
    data: z.iso.date().optional(),
    hora: z.string().trim().max(5).default(""),
    /** Em branco, assina o representante da loja. */
    vistoriador: texto,
    comprador_acompanhou: z.boolean().optional(),
    km: z.number().int().min(0).max(10_000_000).optional(),
    identificacao: z
      .object({
        placa: conferencia,
        chassi: conferencia,
        motor: conferencia,
        renavam: conferencia,
        remarcacao: z.enum(["nao", "sim"]).optional(),
      })
      .partial()
      .optional(),
    itens: z
      .object(
        Object.fromEntries(
          ITENS_DA_VISTORIA.map(([k]) => [k, situacaoDoItem.optional()]),
        ) as Record<ItemDaVistoria, z.ZodOptional<typeof situacaoDoItem>>,
      )
      .partial()
      .optional(),
    /** Menor profundidade de sulco medida entre os pneus, em mm. */
    sulco_mm: z.number().min(0).max(30).optional(),
    /** Avarias que não cabem num item da tabela. */
    avarias: z
      .array(
        z.object({
          descricao: z.string().trim().min(1).max(300),
          /** Sim: a loja se obriga a reparar antes da entrega. */
          loja_repara: z.boolean().default(false),
        }),
      )
      .max(30)
      .optional(),
    fotos: z
      .object({ quantidade: z.number().int().min(0).max(500).optional(), meio: texto })
      .partial()
      .optional(),
    cautelar: z
      .object({
        empresa: texto,
        cnpj: texto,
        numero: texto,
        data: z.iso.date().optional(),
        resultado: z.enum(["aprovado", "com_apontamentos", "reprovado"]).optional(),
        apontamentos: z.string().trim().max(1000).default(""),
      })
      .partial()
      .optional(),
  })
  .partial();
export type Vistoria = z.infer<typeof vistoriaSchema>;

export const RESULTADOS_DA_CAUTELAR = [
  ["aprovado", "Aprovado"],
  ["com_apontamentos", "Com apontamentos"],
  ["reprovado", "Reprovado"],
] as const;

export interface AvariaDoLaudo {
  descricao: string;
  loja_repara: boolean;
}

const preenchido = (s: string | undefined | null) => (s ?? "").trim() !== "";

/** Toda avaria do laudo: itens marcados A, avulsas e apontamentos da cautelar. */
export function avariasDoLaudo(v: Vistoria): AvariaDoLaudo[] {
  const out: AvariaDoLaudo[] = [];
  for (const [k, , rotulo] of ITENS_DA_VISTORIA) {
    const item = v.itens?.[k];
    if (item?.estado === "A")
      out.push({
        descricao: preenchido(item.obs) ? `${rotulo}: ${item.obs!.trim()}` : rotulo,
        loja_repara: false,
      });
  }
  for (const a of v.avarias ?? []) out.push({ descricao: a.descricao, loja_repara: a.loja_repara });
  if (preenchido(v.cautelar?.apontamentos))
    out.push({
      descricao: `Apontado no laudo cautelar: ${v.cautelar!.apontamentos!.trim()}`,
      loja_repara: false,
    });
  return out;
}

/**
 * Venda sem anexo antigo preenchido usa o laudo; vendas antigas seguem com `estado_veiculo`.
 * Só vale para venda: quem chama confere o tipo.
 */
export function usaLaudoDeVistoria(contrato: {
  estado_veiculo?: Partial<Record<string, string>> | null;
}): boolean {
  return !Object.values(contrato.estado_veiculo ?? {}).some(preenchido);
}

/** Km do laudo e do termo de entrega: a conferida na vistoria vale sobre as outras. */
export const kmDaVistoria = (vistoriaKm?: number, entregaKm?: number, cadastroKm?: number | null) =>
  vistoriaKm ?? entregaKm ?? cadastroKm ?? undefined;

export interface FaltaDaVistoria {
  campo: string;
  mensagem: string;
}

/** O que impede o laudo de sair para assinatura. `entregaKm` é a km do termo de entrega. */
export function faltasDaVistoria(
  v: Vistoria,
  { temRepresentante, entregaKm }: { temRepresentante: boolean; entregaKm?: number },
): FaltaDaVistoria[] {
  const out: FaltaDaVistoria[] = [];
  const falta = (campo: string, mensagem: string) =>
    out.push({ campo: `vistoria.${campo}`, mensagem });
  if (!v.data) falta("data", "Informe a data da vistoria.");
  if (!temRepresentante && !preenchido(v.vistoriador))
    falta("vistoriador", "Informe quem fez a vistoria.");
  if (v.comprador_acompanhou == null)
    falta("comprador_acompanhou", "Informe se o comprador acompanhou a vistoria.");
  if (v.km == null) falta("km", "Informe a quilometragem conferida na vistoria.");
  else if (entregaKm != null && entregaKm !== v.km)
    falta(
      "km",
      "A quilometragem da vistoria difere da quilometragem na entrega; corrija uma das duas.",
    );

  const id = v.identificacao ?? {};
  for (const [k, rotulo] of [
    ["placa", "a placa"],
    ["chassi", "o chassi"],
    ["motor", "o número do motor"],
    ["renavam", "o Renavam"],
  ] as const)
    if (!id[k]) falta(`identificacao.${k}`, `Confira ${rotulo} com o documento do veículo.`);
  if (!id.remarcacao)
    falta("identificacao.remarcacao", "Informe se há sinal de remarcação de chassi ou motor.");
  // Identificação adulterada é crime (CP art. 311): o laudo não sai para assinatura.
  if (id.chassi === "divergente" || id.motor === "divergente" || id.remarcacao === "sim")
    falta(
      "identificacao",
      "Chassi ou motor divergente, ou com sinal de remarcação: não conclua a venda e verifique a origem do veículo.",
    );

  for (const [k, , rotulo] of ITENS_DA_VISTORIA) {
    const item = v.itens?.[k];
    if (!item?.estado) falta(`itens.${k}`, `Informe o estado de: ${rotulo}.`);
    else if (item.estado === "NV" && !preenchido(item.justificativa))
      falta(`itens.${k}`, `Justifique por que não verificou: ${rotulo}.`);
    else if (item.estado === "A" && !preenchido(item.obs))
      falta(`itens.${k}`, `Descreva a avaria em: ${rotulo}.`);
  }
  if (v.sulco_mm != null && v.sulco_mm < SULCO_MINIMO_MM && v.itens?.pneus?.estado !== "A")
    falta("itens.pneus", `Sulco abaixo de ${SULCO_MINIMO_MM} mm: marque os pneus como avaria.`);
  return out;
}
