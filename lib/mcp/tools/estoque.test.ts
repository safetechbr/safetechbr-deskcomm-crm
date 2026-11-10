import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { McpContext } from "../types";
import { crmConsultarEstoque, estoqueInputShape, type ItemDoEstoque, type resumirEstoque } from "./estoque";
import { catalogEntry } from "./catalog";
import { criarEvidenciasComerciaisDoTurno } from "@/lib/agent-engine/guardrails/promise/evidencias-comerciais";

const reservas = vi.hoisted(() => vi.fn(async () => new Map()));
vi.mock("@/lib/veiculos/reservas-server", () => ({ reservasAtivas: reservas }));
const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA = "22222222-2222-4222-8222-222222222222";
function item(id: string, extra: Partial<ItemDoEstoque> = {}): ItemDoEstoque {
  return { id, organization_id: ORG, codigo: id, marca: "Renault", modelo: "Logan", versao: "1.6",
    ano_fabricacao: 2020, ano_modelo: 2021, km: 45000, cambio: "Manual", combustivel: "Flex",
    cor: "Prata", preco_cents: 4_900_000, moeda: "BRL", descricao: "Revisado", opcionais: null,
    status: "disponivel", ...extra };
}
function contexto(linhas: ItemDoEstoque[], opcoes: { pagina?: number; semCount?: boolean; erro?: boolean; ignorarEscopo?: boolean } = {}) {
  const consultas: Array<{ tabela: string; filtros: Array<[string, unknown]>; select: string }> = [];
  const from = vi.fn((tabela: string) => {
    const chamada = { tabela, filtros: [] as Array<[string, unknown]>, select: "" }; consultas.push(chamada);
    const query = {
      select: (colunas: string) => { chamada.select = colunas; return query; },
      eq: (k: string, v: unknown) => { chamada.filtros.push([k,v]); return query; },
      order: () => query,
      range: async (de: number, ate: number) => {
        const permitidos = opcoes.ignorarEscopo ? linhas : linhas.filter(v => chamada.filtros.every(([k, valor]) => v[k as keyof ItemDoEstoque] === valor));
        return { data: permitidos.slice(de, Math.min(ate+1, de+(opcoes.pagina ?? 500))),
          error: opcoes.erro ? { message: "erro privado" } : null, count: opcoes.semCount ? null : permitidos.length };
      },
    }; return query;
  });
  return { consultas, ctx: { organizationId: ORG, supabase: { from } } as unknown as McpContext };
}
const filtros = (v = {}) => z.object(estoqueInputShape).parse(v);
async function consultar(linhas: ItemDoEstoque[], input = {}, opcoes = {}) {
  const c = contexto(linhas, opcoes);
  const resultado = await crmConsultarEstoque.handler(filtros(input), c.ctx) as ReturnType<typeof resumirEstoque>;
  return { resultado, ...c };
}

describe("estoque novo no atendimento", () => {
  it("aparece como leitura segura e selecionável em vender e atender", () => {
    expect(catalogEntry(crmConsultarEstoque.name)).toMatchObject({ category: "read", risco: "seguro", rotulo: "Consultar estoque e preços", pacotes: ["vender", "atender"] });
    expect(crmConsultarEstoque.requiresScope).toBe("mcp:read");
  });

  it("resume o estoque inteiro sem mandar a lista quando falta direção", async () => {
    const { resultado } = await consultar([item("L1"), item("A1", { marca: "Volkswagen", modelo: "Amarok", preco_cents: 12_000_000 })]);
    expect(resultado).toMatchObject({ total_disponivel: 2, consulta_completa: true, precisa_refinar: true, produtos: [] });
    expect(resultado.resumo.modelos.map(x=>x.nome)).toEqual(["Amarok", "Logan"]);
    expect(resultado.resumo.faixas_de_preco).toEqual([{ moeda: "BRL", minimo_cents: 4_900_000, maximo_cents: 12_000_000 }]);
    expect(resultado.orientacao).toContain("uma pergunta curta por vez");
    expect(crmConsultarEstoque.motivoDoVazio?.(resultado)).toBeNull();
  });

  it("usa a tabela nova, só desta empresa e disponíveis; não lê placas, custos nem arquivos", async () => {
    const { resultado, consultas } = await consultar([item("L1"), item("SEGREDO", { organization_id: OUTRA }), item("VENDIDO", { status: "vendido" }), item("RESERVADO", { status: "reservado" })], { modelo: "Logan" });
    expect(resultado.produtos.map(x=>x.codigo_estoque)).toEqual(["L1"]);
    for (const q of consultas) {
      expect(q.tabela).toBe("veiculos");
      expect(q.filtros).toContainEqual(["organization_id", ORG]);
      expect(q.filtros).toContainEqual(["status", "disponivel"]);
      expect(q.select).not.toMatch(/custo|placa|fotos|video/);
    }
    expect(JSON.stringify(resultado)).not.toMatch(/SEGREDO|RESERVADO|VENDIDO/);
  });

  it("recusa também um retorno que viola o escopo, sem vazar seus dados", async () => {
    const c = contexto([item("SEGREDO", { organization_id: OUTRA })], { ignorarEscopo: true });
    await expect(crmConsultarEstoque.handler(filtros({ modelo: "Logan" }), c.ctx)).rejects.toThrow("escopo_do_estoque_invalido");
  });

  it("aplica todos os filtros juntos e informa o preço exato em centavos e moeda", async () => {
    const { resultado } = await consultar([
      item("CERTO"), item("CARO", { preco_cents: 5_000_001 }), item("ANO", { ano_modelo: 2018 }),
      item("KM", { km: 90000 }), item("CAMBIO", { cambio: "Automático" }), item("COR", { cor: "Branco" }),
    ], { termo: "Renault Logan", marca: "renault", modelo: "LOGAN", preco_min_cents: 4_900_000, preco_max_cents: 5_000_000, moeda: "BRL", ano_min: 2020, ano_max: 2022, km_max: 50000, cambio: "manual", combustivel: "flex", cor: "prata" });
    expect(resultado.produtos).toHaveLength(1);
    expect(resultado.produtos[0]).toMatchObject({ codigo: "veiculo:CERTO", preco_cents: 4_900_000, moeda: "BRL", disponivel: true });
    expect(resultado.produtos[0]!.preco.replace(/\s/g, " ")).toBe("R$ 49.000,00");
  });

  it("mais de três compatíveis pede refinamento sem escolher por conta própria", async () => {
    const { resultado } = await consultar(Array.from({ length: 12 }, (_,i)=>item(String(i))), { modelo: "Logan", preco_max_cents: 5_000_000 });
    expect(resultado).toMatchObject({ total_compativel: 12, precisa_refinar: true, produtos: [] });
    expect(crmConsultarEstoque.motivoDoVazio?.(resultado)).toBeNull();
  });

  it("até três compatíveis podem ser oferecidos e o limite é validado", async () => {
    const { resultado } = await consultar([item("A"), item("B"), item("C")], { modelo: "Logan" });
    expect(resultado.produtos).toHaveLength(3);
    expect(resultado.precisa_refinar).toBe(false);
    expect(z.object(estoqueInputShape).safeParse({ limite: 4 }).success).toBe(false);
  });

  it("o retorno do estoque sustenta a conferência comercial com preço, modelo e km", async () => {
    const { resultado } = await consultar([item("L1", { descricao: "x".repeat(2000), opcionais: "y".repeat(2000) })], { modelo: "Logan" });
    const evidencias = criarEvidenciasComerciaisDoTurno([]);
    evidencias.registrarCatalogo(resultado);
    const lista = evidencias.ler("Logan preço");
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ origem: "catalogo", referencia: "veiculo:L1" });
    expect(lista[0]!.conteudo).toContain("45");
    expect(lista[0]!.conteudo).toContain("49.000");
    expect(lista[0]!.conteudo).toContain("Logan");
  });

  it("não relaxa silenciosamente modelo, orçamento ou ano quando não encontra", async () => {
    const { resultado } = await consultar([item("L1")], { modelo: "Logan", preco_max_cents: 2_000_000, ano_min: 2024 });
    expect(resultado).toMatchObject({ total_compativel: 0, produtos: [], motivo: "nao_encontrado" });
    expect(resultado.orientacao).toContain("Não relaxe");
    expect(crmConsultarEstoque.motivoDoVazio?.(resultado)).toBe("nao_encontrado");
  });

  it("preço não cadastrado não vira oferta de graça nem cabe em orçamento", async () => {
    const exata = await consultar([item("SEM_PRECO", { preco_cents: 0 })], { modelo: "Logan" });
    expect(exata.resultado.produtos[0]!.preco).toBe("Preço a confirmar");
    const faixa = await consultar([item("SEM_PRECO", { preco_cents: 0 })], { preco_max_cents: 10000 });
    expect(faixa.resultado.produtos).toEqual([]);
  });

  it("não compara orçamentos de moedas diferentes sem confirmação", async () => {
    const { resultado } = await consultar([item("BR"), item("US", { moeda: "USD", preco_cents: 100000 })], { preco_max_cents: 5_000_000 });
    expect(resultado).toMatchObject({ precisa_refinar: true, produtos: [], total_compativel: null });
    expect(resultado.orientacao).toContain("moeda");
  });

  it("varre páginas menores que o solicitado sem perder os veículos seguintes", async () => {
    const { resultado, consultas } = await consultar([item("A"),item("B"),item("C")], { modelo: "Logan" }, { pagina: 1 });
    expect(consultas).toHaveLength(3);
    expect(resultado.produtos).toHaveLength(3);
    expect(resultado.consulta_completa).toBe(true);
  });

  it("count ausente exige confirmar o fim; teto de varredura é explícito e não cota preço", async () => {
    const completo = await consultar([item("A"),item("B")], { modelo: "Logan" }, { pagina: 1, semCount: true });
    expect(completo.consultas).toHaveLength(3);
    expect(completo.resultado.consulta_completa).toBe(true);
    const parcial = await consultar(Array.from({length:21},(_,i)=>item(String(i))), { modelo: "Logan" }, { pagina: 1, semCount: true });
    expect(parcial.consultas).toHaveLength(20);
    expect(parcial.resultado).toMatchObject({ consulta_completa: false, total_disponivel: null, total_compativel: null, produtos: [], motivo: "varredura_parcial" });
  });

  it("erros de consulta não viram estoque vazio", async () => {
    await expect(consultar([item("A")], {}, { erro: true })).rejects.toThrow("consultar_estoque_falhou");
  });

  it.each([{preco_min_cents:100,preco_max_cents:99},{ano_min:2025,ano_max:2020}])("recusa filtros inconsistentes antes de consultar: %o", async input => {
    const c = contexto([]);
    await expect(crmConsultarEstoque.handler(filtros(input), c.ctx)).rejects.toThrow("filtros_de_estoque_inconsistentes");
    expect(c.consultas).toHaveLength(0);
  });
});

describe("crm_consultar_estoque — listar títulos", () => {
  it("com listar=true devolve só código e título dos compatíveis, sem preço", async () => {
    const { resumirEstoque } = await import("./estoque");
    const base = { organization_id: "o", marca: "Renault", versao: null, ano_fabricacao: 2020, ano_modelo: 2020, km: 1, cambio: null, combustivel: null, cor: null, preco_cents: 5790000, moeda: "BRL", descricao: null, opcionais: null, status: "disponivel" };
    const itens = [
      { ...base, id: "1", codigo: "A1", modelo: "Logan" },
      { ...base, id: "2", codigo: "A2", modelo: "Sandero" },
      { ...base, id: "3", codigo: "A3", modelo: "Duster" },
      { ...base, id: "4", codigo: "A4", modelo: "Kwid" },
    ];
    const r = resumirEstoque(itens, estoqueInputShape_parse({ listar: true, marca: "Renault" }), true) as { lista?: { codigo: string; titulo: string }[] };
    expect(r.lista).toHaveLength(4);
    expect(r.lista![0]).toEqual({ codigo: expect.stringMatching(/^veiculo:A/), titulo: expect.any(String) });
    expect(JSON.stringify(r.lista)).not.toMatch(/5790000|57\.900/);
  });
  it("filtra por categoria cadastrada e, nos antigos sem categoria, pela inferida do modelo", async () => {
    const { resumirEstoque } = await import("./estoque");
    const base = { organization_id: "o", marca: "X", versao: null, ano_fabricacao: 2020, ano_modelo: 2020, km: 1, cambio: null, combustivel: null, cor: null, preco_cents: 5790000, moeda: "BRL", descricao: null, opcionais: null, status: "disponivel" };
    const itens = [
      { ...base, id: "1", codigo: "A1", modelo: "Creta", categoria: "SUV" },
      { ...base, id: "2", codigo: "A2", modelo: "Compass", categoria: null },
      { ...base, id: "3", codigo: "A3", modelo: "Onix", categoria: "Hatch" },
      { ...base, id: "4", codigo: "A4", modelo: "Zzxq", categoria: null },
    ];
    const r = resumirEstoque(itens, estoqueInputShape_parse({ listar: true, categoria: "suv" }), true) as { lista?: { codigo: string }[] };
    expect(r.lista?.map((l) => l.codigo)).toEqual(["veiculo:A1", "veiculo:A2"]);
  });
});
function estoqueInputShape_parse(i: Record<string, unknown>) {
  return z.object(estoqueInputShape).parse(i);
}

describe("reservas no estoque da IA", () => {
  it("não oferece carro reservado e mantém os demais", async () => {
    reservas.mockResolvedValueOnce(new Map([["R1", { id: "reserva" }]]));
    const { resultado } = await consultar([item("R1"), item("L1")], { modelo: "Logan" });
    expect(resultado.total_disponivel).toBe(1);
    expect(resultado.produtos.map(p => p.veiculo_id)).toEqual(["L1"]);
  });
});
