import { z } from "zod";
import type { McpToolDefinition } from "../types";
import { formatCents } from "@/lib/money";
import { sugerirCategoria } from "@/lib/veiculos/categorias";
import { tituloDoVeiculo } from "@/lib/veiculos/regras";

const texto = z.string().trim().min(1).max(160).optional();
const preco = z.number().int().min(0).max(10_000_000_000).optional();
export const estoqueInputShape = {
  termo: z.string().trim().max(160).optional().default(""),
  marca: texto,
  modelo: texto,
  categoria: texto.describe("Categoria do veículo cadastrada no estoque, ex.: SUV, Hatch, Sedã, Picape. Use quando o cliente pedir por tipo de carro."),
  preco_min_cents: preco.describe("Preço mínimo em CENTAVOS. R$ 50.000 = 5000000."),
  preco_max_cents: preco.describe("Orçamento máximo em CENTAVOS. R$ 50.000 = 5000000."),
  moeda: z.string().regex(/^[A-Z]{3}$/).optional(),
  ano_min: z.number().int().min(1950).max(2100).optional(),
  ano_max: z.number().int().min(1950).max(2100).optional(),
  km_max: z.number().int().min(0).max(2_000_000).optional(),
  cambio: texto,
  combustivel: texto,
  cor: texto,
  limite: z.number().int().min(1).max(3).optional().default(3),
  listar: z.boolean().optional().default(false).describe(
    "true quando o cliente pergunta QUAIS modelos existem (por marca, faixa de preço, categoria como SUV/hatch/sedã, ou tudo). " +
    "Devolve só os TÍTULOS dos veículos compatíveis em `lista`, sem preço e sem ficha. " +
    "Para categoria, passe `categoria` (SUV, Hatch, Sedã, Picape...): o filtro usa a categoria cadastrada em cada veículo.",
  ),
};
type Filtros = z.infer<z.ZodObject<typeof estoqueInputShape>>;
export interface ItemDoEstoque {
  id: string; organization_id: string; codigo: string; marca: string | null;
  modelo: string; versao: string | null; ano_fabricacao: number | null;
  ano_modelo: number | null; km: number | null; categoria?: string | null; cambio: string | null;
  combustivel: string | null; cor: string | null; preco_cents: number;
  moeda: string; descricao: string | null; opcionais: string | null; status: string;
}
const normalizar = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const contem = (valor: string | null, filtro: string | undefined) => !filtro || normalizar(valor).includes(normalizar(filtro));
const COMERCIAL = "id, organization_id, codigo, marca, modelo, categoria, versao, ano_fabricacao, ano_modelo, km, cambio, combustivel, cor, preco_cents, moeda, descricao, opcionais, status";

function facetas(itens: readonly ItemDoEstoque[], campo: "marca" | "modelo" | "cambio" | "combustivel") {
  const contagem = new Map<string, number>();
  for (const item of itens) if (item[campo]) contagem.set(item[campo]!, (contagem.get(item[campo]!) ?? 0) + 1);
  return [...contagem].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .slice(0, 10).map(([nome, quantidade]) => ({ nome, quantidade }));
}

/** O estoque inteiro alimenta o resumo; somente a seleção pequena vai ao modelo. */
export function resumirEstoque(itens: readonly ItemDoEstoque[], filtros: Filtros, completo: boolean) {
  const temFaixa = filtros.preco_min_cents !== undefined || filtros.preco_max_cents !== undefined;
  const moedas = [...new Set(itens.map(v => v.moeda))].sort();
  const moedaAmbigua = temFaixa && !filtros.moeda && moedas.length > 1;
  const termos = normalizar(filtros.termo).split(/\s+/).filter(Boolean);
  const encontrados = itens.filter(v => {
    const ano = v.ano_modelo ?? v.ano_fabricacao;
    const busca = normalizar([v.codigo, v.marca, v.modelo, v.versao].filter(Boolean).join(" "));
    return termos.every(t => busca.includes(t)) && contem(v.marca, filtros.marca) && contem(v.modelo, filtros.modelo)
      && (!filtros.categoria || normalizar(v.categoria ?? sugerirCategoria(v.marca, v.modelo)) === normalizar(filtros.categoria))
      && contem(v.cambio, filtros.cambio) && contem(v.combustivel, filtros.combustivel) && contem(v.cor, filtros.cor)
      && (!filtros.moeda || v.moeda === filtros.moeda)
      && (!temFaixa || v.preco_cents > 0)
      && (filtros.preco_min_cents === undefined || v.preco_cents >= filtros.preco_min_cents)
      && (filtros.preco_max_cents === undefined || v.preco_cents <= filtros.preco_max_cents)
      && (filtros.ano_min === undefined || ano !== null && ano >= filtros.ano_min)
      && (filtros.ano_max === undefined || ano !== null && ano <= filtros.ano_max)
      && (filtros.km_max === undefined || v.km !== null && v.km <= filtros.km_max);
  }).sort((a,b) => a.moeda.localeCompare(b.moeda) || a.preco_cents-b.preco_cents || a.id.localeCompare(b.id));
  const temDirecao = termos.length > 0 || Object.entries(filtros).some(([k,v]) => !["termo", "limite", "moeda", "listar"].includes(k) && v !== undefined);
  const precisaRefinar = !temDirecao || moedaAmbigua || encontrados.length > filtros.limite;
  const selecionados = completo && !precisaRefinar ? encontrados.slice(0, filtros.limite) : [];
  const baseDasFacetas = temDirecao ? encontrados : itens;
  const LIMITE_DA_LISTA = 40;
  const listaDeTitulos = completo && filtros.listar && !moedaAmbigua;
  return {
    ...(listaDeTitulos ? {
      lista: encontrados.slice(0, LIMITE_DA_LISTA).map(v => ({ codigo: `veiculo:${v.codigo}`, titulo: tituloDoVeiculo(v) })),
      lista_truncada: encontrados.length > LIMITE_DA_LISTA,
    } : {}),
    origem: "estoque_de_veiculos",
    consulta_completa: completo,
    total_disponivel: completo ? itens.length : null,
    total_compativel: completo && !moedaAmbigua ? encontrados.length : null,
    precisa_refinar: precisaRefinar,
    resumo: {
      marcas: facetas(baseDasFacetas, "marca"), modelos: facetas(baseDasFacetas, "modelo"),
      cambios: facetas(baseDasFacetas, "cambio"), combustiveis: facetas(baseDasFacetas, "combustivel"),
      faixas_de_preco: moedas.map(moeda => {
        const valores = baseDasFacetas.filter(v => v.moeda === moeda && v.preco_cents > 0).map(v => v.preco_cents);
        return { moeda, minimo_cents: valores.length ? Math.min(...valores) : null, maximo_cents: valores.length ? Math.max(...valores) : null };
      }),
    },
    // Mesmo contrato comercial do catálogo, com códigos em namespace separado.
    // `codigo` com prefixo `veiculo:` vai em produto_codigo do send_message: as fotos saem do estoque de veículos.
    produtos: selecionados.map(v => ({
      veiculo_id: v.id, codigo: `veiculo:${v.codigo}`, codigo_estoque: v.codigo,
      nome: tituloDoVeiculo(v), marca: v.marca, modelo: v.modelo, versao: v.versao,
      ano_fabricacao: v.ano_fabricacao, ano_modelo: v.ano_modelo, km: v.km,
      cambio: v.cambio, combustivel: v.combustivel, cor: v.cor,
      preco_cents: v.preco_cents, moeda: v.moeda,
      preco: v.preco_cents > 0 ? formatCents(v.preco_cents, v.moeda) : "Preço a confirmar",
      descricao: [v.cambio, v.combustivel, v.cor, v.km !== null ? `${v.km} km` : null, v.opcionais?.slice(0, 800), v.descricao?.slice(0, 1200)].filter(Boolean).join(" · ") || tituloDoVeiculo(v),
      disponivel: true,
    })),
    motivo: !completo ? "varredura_parcial" : !itens.length ? "sem_estoque" : !encontrados.length ? "nao_encontrado" : null,
    orientacao: listaDeTitulos && encontrados.length
      ? "Mostre ao cliente só os TÍTULOS de `lista` que atendem o pedido (marca, faixa, categoria), um por linha, sem preço nem detalhes. Em seguida pergunte se ele quer ver as fotos de algum desses modelos. Quando ele responder com o nome (muitas vezes só o modelo, sem versão ou ano), ache o título correspondente na `lista`; se mais de um casar, pergunte qual. Então chame send_message com `produto_codigo` = o `codigo` do veículo (ex.: veiculo:ABC123) e, no `body`, o título, o preço e a descrição cadastrados, que vêm de uma nova consulta com `termo` do modelo. As fotos saem junto."
      : !completo ? "A consulta não terminou. Não afirme ausência, preço ou disponibilidade; confirme com a equipe."
      : moedaAmbigua ? "Confirme a moeda do orçamento antes de comparar preços."
      : !encontrados.length ? "Não há opção compatível com TODOS os filtros. Não relaxe orçamento, modelo ou ano por conta própria; pergunte qual preferência pode mudar."
      : precisaRefinar ? "Não envie a lista do estoque. Aproveite o que o cliente já informou e faça uma pergunta curta por vez para definir orçamento, modelo ou preferência relevante; consulte novamente com os filtros. O resumo serve para orientar perguntas, não para despejar opções."
      : "Apresente somente estas opções compatíveis, no máximo três, com o preço cadastrado e uma diferença útil. Não repita perguntas já respondidas. Preço a confirmar não é preço zero. Para mandar as fotos, use send_message com produto_codigo = o `codigo` do veículo (veiculo:...), com o preço e a descrição no body; esta consulta em si não envia mídia.",
  };
}

export const crmConsultarEstoque: McpToolDefinition<typeof estoqueInputShape> = {
  name: "crm_consultar_estoque",
  description: "Consulta o estoque NOVO de veículos da empresa (não o catálogo antigo de produtos). Use ao falar de modelos, preço e disponibilidade. Sem filtros, retorna um resumo de TODO o estoque disponível, sem despejar os veículos na conversa. Descubra orçamento e modelo/preferências, uma pergunta por vez, aproveitando o que o cliente já disse. Passe somente palavras de marca/modelo/código em termo e use os filtros estruturados; valores monetários são CENTAVOS. Muitos resultados pedem refinamento antes de ofertar. Depois, apresente no máximo 3 opções compatíveis, com preços reais. Nunca ofereça vendido/reservado, invente desconto ou relaxe filtros sem autorização. Para listar modelos (marca, faixa de preço, categoria), use listar=true e mostre só os títulos, perguntando depois de qual quer ver as fotos; para enviar as fotos de um veículo, use send_message com produto_codigo = o `codigo` dele (veiculo:...). A consulta em si não altera estoque nem envia fotos.",
  inputSchema: estoqueInputShape,
  category: "read", requiresRole: "agent", requiresScope: "mcp:read",
  motivoDoVazio: resultado => {
    const r = resultado as { motivo?: string | null };
    return r?.motivo ?? null;
  },
  termoBuscado: input => input.termo || input.modelo || input.marca || input.categoria || null,
  handler: async (input, ctx) => {
    if (input.preco_min_cents !== undefined && input.preco_max_cents !== undefined && input.preco_min_cents > input.preco_max_cents
      || input.ano_min !== undefined && input.ano_max !== undefined && input.ano_min > input.ano_max)
      throw new Error("filtros_de_estoque_inconsistentes");
    const itens: ItemDoEstoque[] = [];
    let completo = false;
    for (let pagina = 0; pagina < 20; pagina++) {
      const { data, error, count } = await ctx.supabase.from("veiculos")
        .select(COMERCIAL, { count: "exact" })
        .eq("organization_id", ctx.organizationId).eq("status", "disponivel")
        .order("id", { ascending: true }).range(itens.length, itens.length + 499);
      if (error) throw new Error("consultar_estoque_falhou");
      const lote = (data ?? []) as ItemDoEstoque[];
      if (lote.some(v => v.organization_id !== ctx.organizationId || v.status !== "disponivel")) throw new Error("escopo_do_estoque_invalido");
      itens.push(...lote);
      if (!lote.length || count !== null && itens.length >= count) { completo = true; break; }
    }
    const { reservasAtivas } = await import("@/lib/veiculos/reservas-server");
    const reservas = await reservasAtivas(ctx.supabase, ctx.organizationId, itens.map(v => v.id), false);
    return resumirEstoque(itens.filter(v => !reservas.has(v.id)), input, completo);
  },
};
