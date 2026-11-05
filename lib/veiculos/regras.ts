import { z } from "zod";

/**
 * O ESTOQUE DE VEÍCULOS — regras que a rota, a tela e o envio compartilham.
 * O banco guarda CAMINHOS de Storage (`vehicle-photos` / `vehicle-videos`,
 * migration 9030), na ordem da tela; a primeira foto é a capa.
 */

export const BUCKET_DAS_FOTOS_DE_VEICULO = "vehicle-photos";
export const BUCKET_DO_VIDEO_DE_VEICULO = "vehicle-videos";

/** O mesmo `cardinality(fotos) <= 15` do CHECK da 9030. A loja exige >= 6. */
export const MAXIMO_DE_FOTOS_DO_VEICULO = 15;
export const MINIMO_RECOMENDADO_DE_FOTOS = 6;
/** O `file_size_limit` do bucket. */
export const TAMANHO_MAXIMO_DA_FOTO_DO_VEICULO = 10 * 1024 * 1024;
export const TAMANHO_MAXIMO_DO_VIDEO = 16 * 1024 * 1024;

export const STATUS_DO_VEICULO = ["disponivel", "reservado", "vendido"] as const;
export type StatusDoVeiculo = (typeof STATUS_DO_VEICULO)[number];

export const ROTULO_DO_STATUS: Record<StatusDoVeiculo, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
};

const FOTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/;
const VIDEO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/;

/** O caminho é desta organização e deste veículo, na forma que a rota gera? */
export function arquivoPertenceAoVeiculo(
  caminho: string,
  orgId: string,
  veiculoId: string,
  tipo: "foto" | "video" = "foto",
): boolean {
  const prefixo = `${orgId}/${veiculoId}/`;
  return caminho.startsWith(prefixo) && (tipo === "foto" ? FOTO : VIDEO).test(caminho.slice(prefixo.length));
}

export function mimeDoArquivoDeVeiculo(caminho: string): "image/png" | "image/jpeg" | "video/mp4" {
  if (caminho.endsWith(".mp4")) return "video/mp4";
  return caminho.endsWith(".png") ? "image/png" : "image/jpeg";
}

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const anoOpcional = z.number().int().min(1950).max(2100).nullish();

export const veiculoCreateSchema = z.object({
  /** Opcional na criação: sem ele, o servidor gera (ver `proximoCodigoDeVeiculo`). */
  codigo: z.string().trim().min(1).max(40).optional(),
  marca: textoOpcional(60),
  modelo: z.string().trim().min(1).max(80),
  versao: textoOpcional(120),
  ano_fabricacao: anoOpcional,
  ano_modelo: anoOpcional,
  km: z.number().int().min(0).max(2_000_000).nullish(),
  motor: textoOpcional(60),
  cambio: textoOpcional(60),
  combustivel: textoOpcional(40),
  cor: textoOpcional(40),
  placa_final: textoOpcional(8),
  preco_cents: z.number().int().min(0).max(100_000_000_00),
  opcionais: textoOpcional(2000),
  descricao: textoOpcional(2000),
  status: z.enum(STATUS_DO_VEICULO).default("disponivel"),
});
export const veiculoPatchSchema = veiculoCreateSchema.partial();

export const COLUNAS_DO_VEICULO =
  "id, codigo, marca, modelo, versao, ano_fabricacao, ano_modelo, km, motor, cambio, combustivel, cor, placa_final, preco_cents, moeda, opcionais, descricao, status, fotos, video, entrada_em, vendido_em, created_at";

export interface Veiculo {
  id: string;
  codigo: string;
  marca: string | null;
  modelo: string;
  versao: string | null;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  km: number | null;
  motor: string | null;
  cambio: string | null;
  combustivel: string | null;
  cor: string | null;
  placa_final: string | null;
  preco_cents: number;
  moeda: string;
  opcionais: string | null;
  descricao: string | null;
  status: StatusDoVeiculo | string;
  fotos: string[];
  video: string | null;
  entrada_em: string;
  vendido_em: string | null;
  created_at: string;
}

/** Marca? Modelo Versão Ano — o nome que identifica o carro exatamente. */
export function tituloDoVeiculo(v: Pick<Veiculo, "marca" | "modelo" | "versao" | "ano_fabricacao" | "ano_modelo">): string {
  const ano =
    v.ano_fabricacao && v.ano_modelo && v.ano_fabricacao !== v.ano_modelo
      ? `${v.ano_fabricacao}/${v.ano_modelo}`
      : String(v.ano_modelo ?? v.ano_fabricacao ?? "");
  return [v.marca, v.modelo, v.versao, ano].filter((p) => p && String(p).trim() !== "").join(" ");
}

export function formatarPreco(cents: number, moeda = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(cents / 100);
}

export function formatarKm(km: number): string {
  return `${new Intl.NumberFormat("pt-BR").format(km)} km`;
}

export type ModoDeEnvio = "completo" | "fotos" | "ficha" | "preco";

/**
 * O texto que acompanha a primeira foto (ou vai sozinho). Padrão da loja:
 * título, km, motor/câmbio, cor, preço — o que o cliente pergunta primeiro.
 */
export function fichaDoVeiculo(v: Veiculo, modo: ModoDeEnvio = "completo"): string {
  const titulo = tituloDoVeiculo(v);
  const preco = formatarPreco(v.preco_cents, v.moeda);
  if (modo === "preco") return `${titulo}\n💰 ${preco}`;
  const linhas = [`🚗 *${titulo}*`];
  if (v.km !== null && v.km !== undefined) linhas.push(`📍 ${formatarKm(v.km)}`);
  const mecanica = [v.motor, v.cambio].filter(Boolean).join(" ");
  if (mecanica) linhas.push(`⚙️ ${mecanica}`);
  const extras = [v.combustivel, v.cor].filter(Boolean).join(" · ");
  if (extras) linhas.push(`🎨 ${extras}`);
  linhas.push(`💰 ${preco}`);
  if (v.opcionais) linhas.push(`\n✅ ${v.opcionais}`);
  if (v.descricao) linhas.push(`\n${v.descricao}`);
  return linhas.join("\n");
}

/** Maior código gerado automaticamente: 4 dígitos. */
export const CODIGO_MAXIMO_DO_VEICULO = 9999;

/**
 * Próximo código livre, de 1 a 9999 (4 dígitos, com zeros à esquerda: 0001).
 * Usa o maior já existente + 1; se passou de 9999, reaproveita o primeiro vazio.
 * Retorna null se os 9999 estiverem ocupados.
 */
export function proximoCodigoDeVeiculo(existentes: string[]): string | null {
  const usados = new Set<number>();
  for (const c of existentes) if (/^\d{1,4}$/.test(c)) usados.add(Number(c));
  const maior = usados.size ? Math.max(...usados) : 0;
  let n = maior + 1;
  if (n > CODIGO_MAXIMO_DO_VEICULO) {
    n = 1;
    while (n <= CODIGO_MAXIMO_DO_VEICULO && usados.has(n)) n++;
    if (n > CODIGO_MAXIMO_DO_VEICULO) return null;
  }
  return String(n).padStart(4, "0");
}
