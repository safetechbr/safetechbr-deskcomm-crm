import { describe, expect, it } from "vitest";
import { montarCorpoDoPost, publicacaoSchema, validarPublicacao } from "./publicacoes";

const AGORA = Date.parse("2026-11-08T12:00:00Z");
const ID = "a".repeat(24);
const midia = (type: "image" | "video" = "image", n = 1) => ({
  type,
  url: `https://media.zernio.com/temp/${n}.jpg`,
});
const base = {
  tipo: "feed" as const,
  legenda: "Oferta",
  midias: [midia()],
  account_ids: [ID],
  agendada_para: "2026-11-09T12:00:00-03:00",
  fuso: "America/Sao_Paulo",
};
const ig = [{ id: ID, platform: "instagram" }];
const parse = (o: object) => publicacaoSchema.parse({ ...base, ...o });

describe("publicacaoSchema", () => {
  it("recusa mídia fora do armazenamento do provedor", () => {
    expect(() => parse({ midias: [{ type: "image", url: "https://evil.com/a.jpg" }] })).toThrow();
    expect(() => parse({ midias: [{ type: "image", url: "http://media.zernio.com/a.jpg" }] })).toThrow();
  });
  it("recusa id de conta fora do formato", () => {
    expect(() => parse({ account_ids: ["x"] })).toThrow();
  });
});

describe("validarPublicacao", () => {
  it("aceita feed com uma mídia", () => {
    expect(() => validarPublicacao(parse({}), ig, AGORA)).not.toThrow();
  });
  it("recusa horário passado", () => {
    expect(() => validarPublicacao(parse({ agendada_para: "2026-11-08T11:00:00Z" }), ig, AGORA)).toThrow(/futuro/);
  });
  it("recusa fuso inválido", () => {
    expect(() => validarPublicacao(parse({ fuso: "Marte/Olimpo" }), ig, AGORA)).toThrow(/Fuso/);
  });
  it("carrossel precisa de 2 a 20 itens", () => {
    expect(() => validarPublicacao(parse({ tipo: "carrossel" }), ig, AGORA)).toThrow(/carrossel/i);
    const duas = [midia("image", 1), midia("image", 2)];
    expect(() => validarPublicacao(parse({ tipo: "carrossel", midias: duas }), ig, AGORA)).not.toThrow();
  });
  it("reel exige exatamente um vídeo", () => {
    expect(() => validarPublicacao(parse({ tipo: "reel" }), ig, AGORA)).toThrow(/vídeo/);
    expect(() => validarPublicacao(parse({ tipo: "reel", midias: [midia("video")] }), ig, AGORA)).not.toThrow();
  });
  it("story, reel e carrossel só em Instagram", () => {
    const fb = [{ id: ID, platform: "facebook" }];
    expect(() => validarPublicacao(parse({ tipo: "story" }), fb, AGORA)).toThrow(/Instagram/);
  });
});

describe("montarCorpoDoPost", () => {
  it("story leva customMedia e contentType", () => {
    const corpo = montarCorpoDoPost(parse({ tipo: "story" }), ig);
    expect(corpo.platforms[0]).toMatchObject({
      accountId: ID,
      platformSpecificData: { contentType: "story" },
      customMedia: [midia()],
    });
  });
  it("feed não leva campos de story", () => {
    const corpo = montarCorpoDoPost(parse({}), ig);
    expect(corpo.platforms[0]).not.toHaveProperty("platformSpecificData");
    expect(corpo).toMatchObject({ scheduledFor: base.agendada_para, timezone: base.fuso });
  });
});
