import base from "./catalogo-fipe.json";

/**
 * Catálogo de marcas e modelos de carros do Brasil, extraído da tabela FIPE
 * (API pública fipe.parallelum.com.br, em 2026-11-04). Fica em arquivo estático:
 * o cadastro não depende de serviço externo. Para atualizar, refaça a extração
 * e substitua `catalogo-fipe.json` (formato: [{marca, modelos: [nomeFipe]}]).
 */
const CATALOGO = base as Array<{ marca: string; modelos: string[] }>;

/** Nomes da FIPE que o público conhece de outro jeito. */
const NOME_DA_MARCA: Record<string, string> = {
  "GM - Chevrolet": "Chevrolet",
  "VW - VolksWagen": "Volkswagen",
};
const nomeDaMarca = (fipe: string) => NOME_DA_MARCA[fipe] ?? fipe;

export function marcasDoCatalogo(): string[] {
  return CATALOGO.map((c) => nomeDaMarca(c.marca)).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

const capitalizar = (s: string) =>
  /\d/.test(s) || s.length <= 3 ? s.toUpperCase() : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Nomes FIPE da marca que contêm TODAS as palavras digitadas (qualquer ordem). */
export function modelosDaMarca(marca: string, busca = "", limite = 30): string[] {
  const alvo = semAcento(marca);
  const item = CATALOGO.find((c) => semAcento(nomeDaMarca(c.marca)) === alvo);
  if (!item) return [];
  const palavras = semAcento(busca).split(/\s+/).filter(Boolean);
  const achados = item.modelos.filter((m) => {
    const n = semAcento(m);
    return palavras.every((p) => n.includes(p));
  });
  return achados.slice(0, limite);
}

const FAMILIAS_COM_DUAS_PALAVRAS = new Set(["grand", "land", "range", "santa", "new", "cross", "gran", "mini"]);

export interface ModeloInterpretado {
  modelo: string;
  versao: string | null;
  motor: string | null;
  cambio: string | null;
  combustivel: string | null;
}

/** "Pulse Turbo 200 1.0 Flex 12V Aut." → modelo Pulse, motor 1.0 Turbo, Automático, Flex. */
export function interpretarModeloFipe(nome: string): ModeloInterpretado {
  const partes = nome.trim().split(/\s+/);
  const n = FAMILIAS_COM_DUAS_PALAVRAS.has((partes[0] ?? "").toLowerCase()) && partes.length > 2 ? 2 : 1;
  const modelo = partes.slice(0, n).map(capitalizar).join(" ");
  const versao = partes.slice(n).join(" ") || null;

  const cilindrada = /\b(\d\.\d)\b/.exec(nome)?.[1];
  const turbo = /turbo|tsi|tfsi|tdi|t-jet|tjet/i.test(nome);
  const motor = cilindrada ? (turbo ? `${cilindrada} turbo` : cilindrada) : null;

  let cambio: string | null = null;
  if (/semi-?aut|automatizad|dualogic|i-?motion|easytronic/i.test(nome)) cambio = "Automatizado";
  else if (/\bcvt\b/i.test(nome)) cambio = "CVT";
  else if (/\baut\.?(\s|$)|automátic|tiptronic|dsg|s tronic/i.test(nome)) cambio = "Automático";
  else if (/\bmec\.?(\s|$)|manual/i.test(nome)) cambio = "Manual";

  let combustivel: string | null = null;
  if (/diesel/i.test(nome)) combustivel = "Diesel";
  else if (/el[ée]tric/i.test(nome)) combustivel = "Elétrico";
  else if (/h[ií]brid|hybrid/i.test(nome)) combustivel = "Híbrido";
  else if (/flex|tetra/i.test(nome)) combustivel = "Flex";
  else if (/gasolina|\bgas\b/i.test(nome)) combustivel = "Gasolina";

  return { modelo, versao, motor, cambio, combustivel };
}
