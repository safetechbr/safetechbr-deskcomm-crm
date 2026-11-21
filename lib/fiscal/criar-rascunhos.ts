/**
 * Cria os rascunhos de NF-e de uma negociação concluída. Idempotente: o índice
 * único (negociacao_id, operacao) impede duplicata, então chamar de novo é seguro.
 * Rascunho incompleto também é criado: a validação só bloqueia o botão Emitir.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Negociacao } from "@/lib/pdv/regras";
import { codigoIbgePorCep } from "./ibge";
import { ncmPadraoDaCategoria } from "./ncm";
import type { PessoaFiscal, RascunhoFiscal, VeiculoFiscal } from "./rascunho";
import type { OperacaoFiscal } from "./regras";

/** "2026-11-20" ou "20/11/2026" + "14:30" → ISO com fuso de Brasília. Null se a data não for legível. */
export function dataDoTermo(dia: string | null | undefined, hora: string | null | undefined): string | null {
  const d = (dia ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d) ?? /^(\d{2})\/(\d{2})\/(\d{4})/.exec(d);
  if (!m) return null;
  const [y, mo, da] = d.includes("/") ? [m[3], m[2], m[1]] : [m[1], m[2], m[3]];
  const h = /^(\d{1,2}):(\d{2})/.exec((hora ?? "").trim());
  const hh = h ? h[1]!.padStart(2, "0") : "12";
  const mm = h ? h[2] : "00";
  return `${y}-${mo}-${da}T${hh}:${mm}:00-03:00`;
}

async function pessoaDaNegociacao(n: Negociacao): Promise<PessoaFiscal> {
  const c = n.cliente;
  return {
    nome: c.nome ?? "",
    documento: (c.documento ?? "").replace(/\D/g, ""),
    email: c.email ?? null,
    cep: (c.cep ?? "").replace(/\D/g, ""),
    logradouro: c.endereco ?? "",
    numero: c.numero ?? "",
    complemento: c.complemento ?? null,
    bairro: c.bairro ?? "",
    municipio: c.cidade ?? "",
    uf: (c.uf ?? "").toUpperCase(),
    codigo_municipio: await codigoIbgePorCep(c.cep),
  };
}

async function veiculoFiscal(
  admin: SupabaseClient, org: string, id: string | null,
  reserva: { marca?: string | null; modelo?: string | null; ano_fabricacao?: number | null; ano_modelo?: number | null; cor?: string | null; chassi?: string | null; placa?: string | null; renavam?: string | null; km?: number | null },
): Promise<VeiculoFiscal> {
  const { data } = id
    ? await admin.from("veiculos").select("marca, modelo, ano_fabricacao, ano_modelo, cor, chassi, placa, renavam, km, ncm, categoria")
        .eq("id", id).eq("organization_id", org).maybeSingle()
    : { data: null };
  const v = (data ?? {}) as Record<string, unknown>;
  const pick = <T>(a: unknown, b: T | null | undefined) => ((a ?? b ?? null) as T | null);
  return {
    marca: pick(v.marca, reserva.marca), modelo: pick(v.modelo, reserva.modelo),
    ano_fabricacao: pick(v.ano_fabricacao, reserva.ano_fabricacao), ano_modelo: pick(v.ano_modelo, reserva.ano_modelo),
    cor: pick(v.cor, reserva.cor), chassi: pick(v.chassi, reserva.chassi), placa: pick(v.placa, reserva.placa),
    renavam: pick(v.renavam, reserva.renavam), km: v.km != null ? Number(v.km) : (reserva.km ?? null),
    ncm: (v.ncm as string | null) ?? ncmPadraoDaCategoria(v.categoria as string | null),
  };
}

export interface RascunhoCriado { operacao: OperacaoFiscal; id: string | null; criado: boolean }

export async function criarRascunhosDaNegociacao(
  admin: SupabaseClient, org: string, n: Negociacao, userId: string,
): Promise<RascunhoCriado[]> {
  const pessoa = await pessoaDaNegociacao(n);
  const concluida = n.concluida_em ?? new Date().toISOString();
  const alvos: Array<{ operacao: OperacaoFiscal; veiculoId: string | null; reserva: object; valor: number; data: string; extra: Partial<RascunhoFiscal>; finalidadeTipo: "entrada" | "saida" }> = [];

  if (n.tipo === "compra") {
    alvos.push({ operacao: "ENT_COMPRA_PF", veiculoId: n.veiculo_id, reserva: n.veiculo, valor: n.valor_cents, data: concluida, extra: { origem: "compra_pf" }, finalidadeTipo: "entrada" });
  } else {
    const t = n.troca;
    if (t && t.valor_cents > 0) {
      const data = dataDoTermo(n.contrato?.recebimento_troca_em, n.contrato?.recebimento_troca_hora) ?? concluida;
      alvos.push({ operacao: "ENT_TROCA", veiculoId: n.troca_veiculo_id, reserva: t, valor: t.valor_cents, data, extra: { origem: "troca" }, finalidadeTipo: "entrada" });
    }
    alvos.push({
      operacao: "SAI_VENDA", veiculoId: n.veiculo_id, reserva: n.veiculo,
      valor: Math.max(0, n.valor_cents - n.desconto_cents),
      data: n.contrato?.assinatura_em ?? concluida,
      extra: { troca_placa: t && t.valor_cents > 0 ? (t.placa ?? null) : null }, finalidadeTipo: "saida",
    });
  }

  const out: RascunhoCriado[] = [];
  for (const a of alvos) {
    const rascunho: RascunhoFiscal = {
      pessoa, veiculo: await veiculoFiscal(admin, org, a.veiculoId, a.reserva), ...a.extra,
    } as RascunhoFiscal;
    const { data, error } = await admin.from("documentos_fiscais").insert({
      organization_id: org, modelo: "55", operacao: a.operacao, tipo: a.finalidadeTipo, finalidade: "normal",
      status: "rascunho", ambiente: "homologacao", data_emissao: a.data, valor_total_cents: a.valor,
      veiculo_id: a.veiculoId, negociacao_id: n.id, rascunho, created_by: userId,
    }).select("id").maybeSingle();
    // 23505 = já existe rascunho vivo para essa operação: não é erro.
    if (error && error.code !== "23505") throw new Error(error.message);
    out.push({ operacao: a.operacao, id: data?.id ?? null, criado: Boolean(data) });
  }
  return out;
}
