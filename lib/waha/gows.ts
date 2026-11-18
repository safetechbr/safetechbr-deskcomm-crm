/**
 * O `_data` do engine GOWS traduzido para a forma NOWEB (Baileys) que o resto
 * do CRM lê.
 *
 * ─── Por que existe ─────────────────────────────────────────────────────────
 *
 * O NOWEB parou de entregar mensagem recebida em produção (nov/2026): a sessão
 * fica WORKING, o envio funciona, e o `message.any` de quem escreve só chega na
 * rajada do buffer depois de um reconnect. O GOWS (whatsmeow) recebe ao vivo —
 * medido lado a lado no mesmo número. Mas os campos NORMALIZADOS do WAHA
 * (`from`, `body`, `replyTo`, `media`…) são iguais nos dois engines; o que muda
 * é o `_data` cru, e é nele que o CRM acha:
 *
 *   - o TELEFONE de quem escreve em `@lid` (`key.remoteJidAlt`/`participantAlt`)
 *   - o NOME do aparelho (`pushName`)
 *   - o tipo da mensagem e o vCard (chaves de `message`)
 *   - a citação (`message.<tipo>.contextInfo.stanzaId`)
 *   - a atribuição de anúncio (`externalAdReply.sourceId`/`sourceUrl`/…)
 *
 * Traduzir num ponto só (o schema do envelope, por onde passam o webhook e o
 * histórico) evita espalhar `?? Info.SenderAlt` por oito leitores.
 *
 * ─── O formato GOWS, medido (WAHA gows 2026.10.1) ───────────────────────────
 *
 *   _data.Info.Chat          o chat (`…@lid`, `…@g.us`, `…@s.whatsapp.net`)
 *   _data.Info.Sender        quem escreveu (em grupo, o participante)
 *   _data.Info.SenderAlt     o telefone de quem escreveu (`…@s.whatsapp.net`)
 *   _data.Info.RecipientAlt  em `fromMe` 1:1, o telefone do DESTINATÁRIO
 *   _data.Info.IsFromMe / IsGroup / ID / PushName
 *   _data.Message            o proto do WhatsApp, chaves iguais às do Baileys
 *                            (`extendedTextMessage`, `imageMessage`…) exceto as
 *                            siglas: `stanzaID`, `sourceURL`, `sourceID`…
 *
 * ─── Regras ─────────────────────────────────────────────────────────────────
 *
 * Só traduz o que é GOWS (`Info` objeto e nenhum `key`/`message`): payload
 * NOWEB passa INTACTO. Nunca lança: campo estranho vira ausente, e a guarda de
 * cada leitor (telefone só se parecer telefone, etc.) continua valendo. As
 * chaves originais ficam, as traduzidas são ACRESCENTADAS.
 */

type Obj = Record<string, unknown>;

function objeto(v: unknown): Obj | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : null;
}

function texto(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** `stanzaID` → `stanzaId`, `sourceURL` → `sourceUrl`, `remoteJID` → `remoteJid`. */
function aliasBaileys(chave: string): string | null {
  const nova = chave.replace(/(ID|URL|JID)(?=[A-Z]|$)/g, (m) => m[0] + m.slice(1).toLowerCase());
  return nova === chave ? null : nova;
}

/** Profundidade máxima: o proto aninha citação dentro de citação, nunca dezenas. */
const PROFUNDIDADE_MAXIMA = 12;

function comAliases(v: unknown, nivel = 0): unknown {
  if (nivel > PROFUNDIDADE_MAXIMA) return v;
  if (Array.isArray(v)) return v.map((x) => comAliases(x, nivel + 1));
  const o = objeto(v);
  if (!o) return v;
  const saida: Obj = {};
  for (const [k, valor] of Object.entries(o)) saida[k] = comAliases(valor, nivel + 1);
  for (const [k, valor] of Object.entries(saida)) {
    const alias = aliasBaileys(k);
    if (alias && !(alias in saida)) saida[alias] = valor;
  }
  return saida;
}

/** É o `_data` do GOWS? `Info` objeto e nenhuma das casas do NOWEB. */
export function ehDataGows(data: unknown): boolean {
  const d = objeto(data);
  return !!d && !!objeto(d.Info) && d.key === undefined && d.message === undefined;
}

/** O `_data` GOWS acrescido de `key`, `pushName` e `message` na forma NOWEB. */
export function dataGowsComoNoweb(data: unknown): unknown {
  if (!ehDataGows(data)) return data;
  const d = data as Obj;
  const info = d.Info as Obj;
  const fromMe = info.IsFromMe === true;
  const grupo = info.IsGroup === true || (texto(info.Chat)?.endsWith("@g.us") ?? false);

  const key: Obj = {
    remoteJid: texto(info.Chat),
    fromMe,
    id: texto(info.ID),
  };
  if (grupo) {
    key.participant = texto(info.Sender);
    key.participantAlt = texto(info.SenderAlt);
  } else {
    // NOWEB: `remoteJidAlt` é o alternativo do CHAT — em `fromMe` o chat é o
    // destinatário, então o telefone dele vem em `RecipientAlt`, não no
    // `SenderAlt` (que seria o número da própria loja).
    key.remoteJidAlt = fromMe ? texto(info.RecipientAlt) : texto(info.SenderAlt);
  }

  const saida: Obj = { ...d, key };
  const nome = texto(info.PushName);
  if (nome !== undefined && d.pushName === undefined) saida.pushName = nome;
  if (d.Message !== undefined) saida.message = comAliases(d.Message);
  return saida;
}

/**
 * Aplica a tradução ao payload inteiro (o objeto `payload` do webhook ou um item
 * do histórico). Usado como `preprocess` do schema — então devolve o valor de
 * entrada intacto quando não há o que traduzir.
 */
export function payloadGowsComoNoweb(payload: unknown): unknown {
  const p = objeto(payload);
  if (!p || !ehDataGows(p._data)) return payload;
  return { ...p, _data: dataGowsComoNoweb(p._data) };
}
