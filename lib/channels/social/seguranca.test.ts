import { describe, expect, it } from "vitest";
import {
  decidirParaContas,
  decidirPublicacao,
  intervaloComVariacao,
  lerSeguranca,
  presetDe,
  PRESETS_DE_SEGURANCA,
  SEGURANCA_PADRAO,
  segurancaSchema,
} from "./seguranca";

const AGORA = Date.parse("2026-11-09T12:00:00Z");
const s = (n: number) => n * 1000;
const c = { ...SEGURANCA_PADRAO, limite_diario: 3, lote: 2, pausa_lote_s: 300 };

describe("decidirPublicacao", () => {
  it("conta sem histórico publica", () => {
    expect(decidirPublicacao([], c, AGORA)).toEqual({ acao: "publicar" });
  });

  it("segura dentro do intervalo mínimo e libera depois dele", () => {
    const ultima = AGORA - s(5);
    const d = decidirPublicacao([ultima], c, AGORA);
    expect(d).toMatchObject({ acao: "adiar", motivo: "intervalo" });
    const espera = intervaloComVariacao(c, ultima);
    expect(espera).toBeGreaterThanOrEqual(c.intervalo_min_s);
    expect(espera).toBeLessThanOrEqual(c.intervalo_max_s);
    expect(decidirPublicacao([ultima], c, ultima + s(espera))).toEqual({ acao: "publicar" });
  });

  it("a variação é repetível: a mesma pergunta dá o mesmo horário", () => {
    const ultima = AGORA - s(5);
    expect(decidirPublicacao([ultima], c, AGORA)).toEqual(decidirPublicacao([ultima], c, AGORA + 1));
  });

  it("o limite diário usa janela móvel de 24h e diz quando volta", () => {
    const h = 3_600_000;
    const feitas = [AGORA - 20 * h, AGORA - 10 * h, AGORA - 1 * h];
    const d = decidirPublicacao(feitas, c, AGORA);
    expect(d).toEqual({ acao: "adiar", motivo: "limite_diario", ate: AGORA - 20 * h + 24 * h });
  });

  it("publicação com mais de 24h não conta", () => {
    const velhas = [AGORA - 30 * 3_600_000, AGORA - 26 * 3_600_000, AGORA - 25 * 3_600_000];
    expect(decidirPublicacao(velhas, c, AGORA)).toEqual({ acao: "publicar" });
  });

  it("fecha o lote e exige a pausa grande", () => {
    // lote = 2: duas publicações próximas → agora é pausa, não o intervalo curto.
    const feitas = [AGORA - s(200), AGORA - s(100)];
    const d = decidirPublicacao(feitas, c, AGORA);
    expect(d).toEqual({ acao: "adiar", motivo: "pausa_de_lote", ate: AGORA - s(100) + s(300) });
    expect(decidirPublicacao(feitas, c, AGORA - s(100) + s(300))).toEqual({ acao: "publicar" });
  });

  it("depois da pausa o lote recomeça", () => {
    const feitas = [AGORA - s(1000), AGORA - s(900), AGORA - s(500)];
    // 900→500 é uma pausa de 400s (>= 300): o lote em curso tem 1 item, vale o intervalo curto.
    // 500s desde a última > intervalo máximo (120s): libera.
    expect(decidirPublicacao(feitas, { ...c, limite_diario: 10 }, AGORA)).toEqual({ acao: "publicar" });
  });
});

describe("decidirParaContas", () => {
  it("só libera quando TODAS as contas estão liberadas e espera a mais lenta", () => {
    const mapa = new Map([["a", [AGORA - s(5)]]]);
    const d = decidirParaContas(["a", "b"], mapa, c, AGORA);
    expect(d).toMatchObject({ acao: "adiar", motivo: "intervalo" });
    expect(decidirParaContas(["b"], mapa, c, AGORA)).toEqual({ acao: "publicar" });
  });
});

describe("configuração", () => {
  it("os presets são válidos e se reconhecem", () => {
    for (const [nome, p] of Object.entries(PRESETS_DE_SEGURANCA)) {
      expect(segurancaSchema.safeParse(p).success).toBe(true);
      expect(presetDe(p)).toBe(nome);
    }
    expect(presetDe({ ...SEGURANCA_PADRAO, limite_diario: 21 })).toBe("personalizado");
  });

  it("recusa passar do teto da Meta e intervalos incoerentes", () => {
    expect(segurancaSchema.safeParse({ ...SEGURANCA_PADRAO, limite_diario: 101 }).success).toBe(false);
    expect(segurancaSchema.safeParse({ ...SEGURANCA_PADRAO, intervalo_min_s: 200 }).success).toBe(false);
    expect(segurancaSchema.safeParse({ ...SEGURANCA_PADRAO, pausa_lote_s: 60 }).success).toBe(false);
  });

  it("valor corrompido cai no padrão, nunca em 'sem limite'", () => {
    expect(lerSeguranca(null)).toEqual(SEGURANCA_PADRAO);
    expect(lerSeguranca({ limite_diario: 9999 })).toEqual(SEGURANCA_PADRAO);
  });
});
