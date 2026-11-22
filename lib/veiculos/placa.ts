/**
 * Placa de veículo: normalização, validação e leitura da resposta da API Placas.
 * Formatos aceitos: antigo (ABC1234) e Mercosul (ABC1D23).
 */
import { z } from "zod";

/** Maiúsculas, sem hífen/espaço, no máximo 7 caracteres. */
export function normalizarPlaca(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

export function placaValida(placa: string): boolean {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa);
}

export interface DadosDaPlaca {
  marca: string | null;
  modelo: string | null;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  cor: string | null;
  municipio: string | null;
  uf: string | null;
}

const texto = z.union([z.string(), z.number()]).nullish();

const respostaSchema = z.object({
  error: z.boolean().optional(),
  basico: z
    .object({
      error: z.boolean().optional(),
      dados: z
        .object({
          marca: texto,
          modelo: texto,
          ano: texto,
          anoModelo: texto,
          ano_modelo: texto,
          cor: texto,
          municipio: texto,
          uf: texto,
        })
        .passthrough(),
    })
    .passthrough(),
});

const limpo = (v: string | number | null | undefined): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
};
const ano = (v: string | number | null | undefined): number | null => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return n >= 1900 && n <= 2100 ? n : null;
};

/** `null` quando a resposta não tem o formato esperado ou veio com erro. */
export function lerRespostaDaPlaca(json: unknown): DadosDaPlaca | null {
  const r = respostaSchema.safeParse(json);
  if (!r.success || r.data.error || r.data.basico.error) return null;
  const d = r.data.basico.dados;
  const fab = ano(d.ano);
  const mod = ano(d.anoModelo ?? d.ano_modelo) ?? fab;
  const dados: DadosDaPlaca = {
    marca: limpo(d.marca),
    modelo: limpo(d.modelo),
    ano_fabricacao: fab,
    ano_modelo: mod,
    cor: limpo(d.cor),
    municipio: limpo(d.municipio),
    uf: limpo(d.uf),
  };
  return dados.marca || dados.modelo ? dados : null;
}
