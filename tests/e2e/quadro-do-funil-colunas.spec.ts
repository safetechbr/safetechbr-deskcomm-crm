/**
 * Rolagem independente das etapas: altura limitada à tela, cabeçalhos fixos,
 * cards sem encolher e coluna vizinha/parente imóveis ao rolar uma lista.
 * Mede geometria real; funciona no mesmo KanbanBoard usado pela central.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test, type Locator, type Page } from "./helpers/test";
import { createClient } from "@supabase/supabase-js";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");

interface Creds {
  password: string;
  org_id: string;
  users: Record<string, { id: string; email: string; role: string }>;
}

const env = carregarEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let creds: Creds;
const SUFIXO = `${Date.now()}`.slice(-7);

// ─── Funil principal: 8 etapas, a primeira comprida ───────────────────────
const NOME_PRINCIPAL = `Colunas E2E ${SUFIXO}`;
/** 14 na etapa comprida — o suficiente para o quadro rolar bastante além da tela. */
const QUANTOS = 14;
/** Quantos cards em cada etapa (a 1ª é a comprida; há etapas de 1 e de 4 cards). */
const CARDS_POR_ETAPA = [QUANTOS, 0, 1, 0, 4, 0, 0, 0];
const TITULO = (etapa: number, i: number) => `Col ${SUFIXO} e${etapa} c${String(i).padStart(2, "0")}`;
let etapas: { id: string; nome: string; cards: number }[] = [];

// ─── Funil de UMA etapa só ────────────────────────────────────────────────
const NOME_UNICA = `Colunas E2E ${SUFIXO} unica`;
let etapaUnicaId = "";

async function login(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app/, { timeout: 60_000 });
}

async function limparFixtures(): Promise<void> {
  const { data } = await admin
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", creds.org_id)
    .like("name", `Colunas E2E ${SUFIXO}%`);
  const ids = ((data ?? []) as { id: string }[]).map((p) => p.id);
  if (ids.length === 0) return;
  await admin.from("crm_lead_activities").delete().in("pipeline_id", ids);
  await admin.from("crm_leads").delete().in("pipeline_id", ids);
  await admin.from("crm_stages").delete().in("pipeline_id", ids);
  await admin.from("crm_pipelines").delete().in("id", ids);
}

async function semearFunil(nome: string, cardsPorEtapa: number[]): Promise<{ pipelineId: string; ids: string[] }> {
  const { data: funil, error } = await admin
    .from("crm_pipelines")
    .insert({ organization_id: creds.org_id, name: nome, slug: nome.toLowerCase().replace(/[^a-z0-9]+/g, "-") })
    .select("id")
    .single();
  if (error) throw new Error(`funil ${nome}: ${error.message}`);
  const pipelineId = (funil as { id: string }).id;

  const ids: string[] = [];
  const linhas: Record<string, unknown>[] = [];
  for (let e = 0; e < cardsPorEtapa.length; e++) {
    const { data: etapa, error: erroEtapa } = await admin
      .from("crm_stages")
      .insert({
        organization_id: creds.org_id,
        pipeline_id: pipelineId,
        name: e === 0 ? "Comprida" : `Etapa ${e + 1}`,
        slug: `etapa-${e + 1}-${SUFIXO}`,
        position: (e + 1) * 1000,
      })
      .select("id")
      .single();
    if (erroEtapa) throw new Error(`etapa ${e + 1}: ${erroEtapa.message}`);
    const stageId = (etapa as { id: string }).id;
    ids.push(stageId);
    for (let i = 0; i < cardsPorEtapa[e]!; i++) {
      linhas.push({
        organization_id: creds.org_id,
        pipeline_id: pipelineId,
        stage_id: stageId,
        title: TITULO(e, i + 1),
        position_in_stage: (i + 1) * 1000,
        source: "manual",
      });
    }
  }
  if (linhas.length > 0) {
    const { error: erroLeads } = await admin.from("crm_leads").insert(linhas);
    if (erroLeads) throw new Error(`leads de ${nome}: ${erroLeads.message}`);
  }
  return { pipelineId, ids };
}

/** O quadro desloca etapas apenas na horizontal. */
function quadro(page: Page): Locator {
  return page.locator("[data-quadro-do-funil]");
}

/** Rola o quadro até o fim (para baixo) e espera o `sticky` assentar. */
async function rolarAteOFim(page: Page): Promise<void> {
  await page.locator("[data-rolagem-da-etapa]").first().evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(400);
}

interface MedidaDaColuna {
  id: string;
  altura: number;
  topo: number;
}

/** A altura DESENHADA de cada coluna, e onde o topo dela está na tela. */
function medirColunas(page: Page): Promise<MedidaDaColuna[]> {
  return page.$$eval("[data-etapa-do-quadro]", (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute("data-etapa-do-quadro") ?? "",
        altura: r.height,
        topo: r.top,
      };
    }),
  );
}

/** A altura da lista de cards (a área que o dnd registra como destino de soltar). */
function alturaDaLista(page: Page, stageId: string): Promise<number> {
  return page
    .locator(`[data-rfd-droppable-id="${stageId}"]`)
    .evaluate((el) => el.getBoundingClientRect().height);
}

async function abrirQuadro(page: Page, pipelineId: string, primeiroTitulo: string): Promise<void> {
  await login(page, creds.users.manager!.email, creds.password);
  await page.goto(`/app/pipelines/${pipelineId}`);
  await expect(page.getByText(primeiroTitulo, { exact: true })).toBeVisible({ timeout: 30_000 });
}

test.describe("Quadro do funil — rolagem independente por etapa", () => {
  test.describe.configure({ timeout: 240_000 });

  let pipelinePrincipal = "";
  let pipelineUnica = "";

  test.beforeAll(async () => {
    if (!fs.existsSync(CREDS_PATH)) {
      execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
    }
    creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
    // O worker do Playwright reinicia depois de um vermelho e o `beforeAll` roda de
    // novo com outro `SUFIXO`: sem esta limpeza os funis das execuções anteriores
    // ficam no banco compartilhado.
    await limparFixtures();

    const principal = await semearFunil(NOME_PRINCIPAL, CARDS_POR_ETAPA);
    pipelinePrincipal = principal.pipelineId;
    etapas = principal.ids.map((id, i) => ({
      id,
      nome: i === 0 ? "Comprida" : `Etapa ${i + 1}`,
      cards: CARDS_POR_ETAPA[i]!,
    }));

    const unica = await semearFunil(NOME_UNICA, [QUANTOS]);
    pipelineUnica = unica.pipelineId;
    etapaUnicaId = unica.ids[0]!;
  });

  test.afterAll(async () => {
    await limparFixtures();
  });

  test("rola os cards da primeira etapa sem mover as outras etapas nem o quadro", async ({ page }) => {
    await abrirQuadro(page, pipelinePrincipal, TITULO(0, 1));
    const listas = page.locator("[data-rolagem-da-etapa]");
    const primeira = listas.first();
    const antes = await medirColunas(page);
    const tamanho = await primeira.evaluate(el => ({ visivel: el.clientHeight, conteudo: el.scrollHeight }));
    expect(tamanho.conteudo).toBeGreaterThan(tamanho.visivel + 100);
    await rolarAteOFim(page);
    expect(await primeira.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    expect(await quadro(page).evaluate(el => el.scrollTop)).toBe(0);
    const rolagens = await listas.evaluateAll(els => els.slice(1).map(el => el.scrollTop));
    expect(rolagens.every(n => n === 0)).toBe(true);
    const depois = await medirColunas(page);
    for (let i = 0; i < antes.length; i++) {
      expect(Math.abs(depois[i]!.topo - antes[i]!.topo)).toBeLessThanOrEqual(1);
      expect(Math.abs(depois[i]!.altura - antes[i]!.altura)).toBeLessThanOrEqual(1);
    }
  });

  test("colunas cheias e vazias cabem no quadro e mantêm área de soltar", async ({ page }) => {
    await abrirQuadro(page, pipelinePrincipal, TITULO(0, 1));
    const visivel = await quadro(page).evaluate(el => el.clientHeight);
    const colunas = await medirColunas(page);
    expect(colunas).toHaveLength(8);
    for (const coluna of colunas) {
      expect(coluna.altura).toBeLessThanOrEqual(visivel + 1);
      expect(coluna.altura).toBeGreaterThan(visivel - 2);
    }
    const vazia = etapas.find(e => e.cards === 0)!;
    for (const id of [vazia.id, etapas[0]!.id]) {
      const altura = await alturaDaLista(page, id);
      expect(altura).toBeGreaterThan(visivel / 2);
      expect(altura).toBeLessThan(visivel);
    }
  });

  test("o cabeçalho e o contorno não saem do lugar ao rolar os cards", async ({ page }) => {
    await abrirQuadro(page, pipelinePrincipal, TITULO(0, 1));
    const cabecalho = page.locator(`[data-etapa-do-quadro="${etapas[0]!.id}"] [data-cabecalho-da-etapa]`);
    const antes = await cabecalho.boundingBox();
    await rolarAteOFim(page);
    const depois = await cabecalho.boundingBox();
    expect(antes).not.toBeNull(); expect(depois).not.toBeNull();
    expect(Math.abs(depois!.y - antes!.y)).toBeLessThanOrEqual(1);
    expect(parseFloat(await cabecalho.evaluate(el => getComputedStyle(el).borderTopWidth))).toBeGreaterThanOrEqual(1);
    await expect(cabecalho).toBeInViewport();
  });

  test("uma etapa só também rola internamente", async ({ page }) => {
    await abrirQuadro(page, pipelineUnica, TITULO(0, 1));
    const lista = page.locator(`[data-rolagem-da-etapa="${etapaUnicaId}"]`);
    await rolarAteOFim(page);
    expect(await lista.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    expect(await quadro(page).evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  });
});
