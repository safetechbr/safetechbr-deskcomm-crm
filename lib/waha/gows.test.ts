/**
 * O `_data` do GOWS lido pelos mesmos leitores do NOWEB. Fixtures com a FORMA
 * medida no WAHA gows 2026.10.1 (nov/2026) e dados inventados — os payloads
 * reais capturados eram de clientes e não entram no repositório.
 */
import { describe, expect, it } from "vitest";

import { wahaPayloadSchema } from "@/lib/waha/envelope";
import { dataGowsComoNoweb, ehDataGows, payloadGowsComoNoweb } from "@/lib/waha/gows";
import {
  notifyNameOf,
  remetenteDoGrupo,
  resolveMessageType,
  telefoneAlternativoDe,
} from "@/lib/waha/ingest";

const LOJA = "5500000000001@s.whatsapp.net";
const CLIENTE_LID = "111111111111111@lid";
const CLIENTE_FONE = "5511999990000@s.whatsapp.net";

function gows(info: Record<string, unknown>, message: Record<string, unknown> = {}) {
  return {
    Info: { ID: "3A0000000000000000AA", Type: "text", ...info },
    Message: message,
  };
}

describe("ehDataGows", () => {
  it("reconhece Info sem key/message", () => {
    expect(ehDataGows(gows({ Chat: CLIENTE_LID }))).toBe(true);
  });
  it("não mexe no NOWEB", () => {
    const noweb = { key: { remoteJid: CLIENTE_LID }, message: { conversation: "oi" } };
    expect(ehDataGows(noweb)).toBe(false);
    expect(dataGowsComoNoweb(noweb)).toBe(noweb);
  });
  it("nunca lança com lixo", () => {
    for (const v of [null, undefined, 1, "x", [], { Info: "x" }, { Info: [] }]) {
      expect(() => payloadGowsComoNoweb({ _data: v })).not.toThrow();
      expect(() => dataGowsComoNoweb(v)).not.toThrow();
    }
  });
});

describe("1:1 recebida em @lid", () => {
  const payload = wahaPayloadSchema.parse({
    id: `false_${CLIENTE_LID}_3A0000000000000000AA`,
    from: CLIENTE_LID,
    fromMe: false,
    body: "quero ver o carro",
    _data: gows(
      { Chat: CLIENTE_LID, Sender: CLIENTE_LID, SenderAlt: CLIENTE_FONE, IsFromMe: false, IsGroup: false, PushName: "Fulano" },
      { conversation: "quero ver o carro" },
    ),
  });

  it("acha o telefone por SenderAlt", () => {
    expect(payload._data?.key?.remoteJidAlt).toBe(CLIENTE_FONE);
    expect(telefoneAlternativoDe(payload)).not.toBeNull();
  });
  it("acha o nome e o tipo", () => {
    expect(notifyNameOf(payload)).toBe("Fulano");
    expect(resolveMessageType(payload)).toBe(resolveMessageType({ ...payload, _data: { message: { conversation: "x" } } }));
  });
});

describe("1:1 enviada pelo celular (fromMe)", () => {
  it("o telefone é o do DESTINATÁRIO, não o da loja", () => {
    const payload = wahaPayloadSchema.parse({
      id: `true_${CLIENTE_LID}_3A0000000000000000AA`,
      from: CLIENTE_LID,
      fromMe: true,
      _data: gows({ Chat: CLIENTE_LID, Sender: LOJA, SenderAlt: LOJA, RecipientAlt: CLIENTE_FONE, IsFromMe: true }),
    });
    expect(payload._data?.key?.remoteJidAlt).toBe(CLIENTE_FONE);
  });
});

describe("grupo", () => {
  it("participant e participantAlt vêm de Sender/SenderAlt", () => {
    const grupo = "120363000000000000@g.us";
    const payload = wahaPayloadSchema.parse({
      id: `false_${grupo}_3A0000000000000000AA_${CLIENTE_LID}`,
      from: grupo,
      fromMe: false,
      _data: gows({ Chat: grupo, Sender: CLIENTE_LID, SenderAlt: CLIENTE_FONE, IsGroup: true, PushName: "Fulano" }),
    });
    expect(payload._data?.key?.participant).toBe(CLIENTE_LID);
    expect(payload._data?.key?.participantAlt).toBe(CLIENTE_FONE);
    expect(remetenteDoGrupo(payload)).not.toBeNull();
  });
});

describe("siglas do proto Go", () => {
  it("stanzaID ganha o alias stanzaId (citação)", () => {
    const d = dataGowsComoNoweb(
      gows({ Chat: CLIENTE_LID }, {
        extendedTextMessage: {
          text: "sim",
          contextInfo: { stanzaID: "ABC", participant: CLIENTE_LID, externalAdReply: { sourceURL: "https://x", sourceID: "9" } },
        },
      }),
    ) as { message: { extendedTextMessage: { contextInfo: Record<string, unknown> } } };
    const ctx = d.message.extendedTextMessage.contextInfo;
    expect(ctx.stanzaId).toBe("ABC");
    expect(ctx.stanzaID).toBe("ABC");
    const ad = ctx.externalAdReply as Record<string, unknown>;
    expect(ad.sourceUrl).toBe("https://x");
    expect(ad.sourceId).toBe("9");
  });
});

describe("ack (sem Info)", () => {
  it("passa intacto", () => {
    const ack = { id: "true_x@lid_ABC", ack: 3, _data: { foo: 1 } };
    expect(payloadGowsComoNoweb(ack)).toBe(ack);
    expect(wahaPayloadSchema.safeParse(ack).success).toBe(true);
  });
});

describe("engineSuportado", () => {
  it("aceita NOWEB e GOWS, recusa o resto", async () => {
    const { engineSuportado } = await import("@/lib/waha/client");
    expect(engineSuportado("GOWS")).toBe(true);
    expect(engineSuportado("NOWEB")).toBe(true);
    expect(engineSuportado("WEBJS")).toBe(false);
    expect(engineSuportado(undefined)).toBe(false);
  });
});
