import { describe, expect, it } from "vitest";
import { bolinhasVisiveis, conteudoDaBolinha, inicialDoNome, textoDoContador } from "./bolinhas";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

const conv = (p: Partial<ConversationWithContact>): ConversationWithContact =>
  ({
    id: "c1",
    status: "open",
    unread_count_for_assignee: 1,
    last_message_at: "2026-01-02",
    ...p,
  }) as ConversationWithContact;

describe("conteudoDaBolinha", () => {
  const contato = (p: object) => ({ id: "k1", ...p }) as ConversationWithContact["contacts"];
  it("usa a foto quando existe e é permitida", () => {
    expect(conteudoDaBolinha(contato({ avatar_storage_path: "x" }), "Ana")).toEqual({
      tipo: "foto",
      src: "/api/v1/contacts/k1/avatar",
    });
  });
  it("cai para a inicial se não há foto ou o contato é anonimizado", () => {
    expect(conteudoDaBolinha(contato({}), "ana")).toEqual({ tipo: "inicial", texto: "A" });
    expect(
      conteudoDaBolinha(contato({ avatar_storage_path: "x", is_anonymized: true }), "Bia"),
    ).toEqual({ tipo: "inicial", texto: "B" });
  });
  it("cai para 'aguardando' sem inicial", () => {
    expect(conteudoDaBolinha(contato({}), "+55 11 9999")).toEqual({ tipo: "aguardando" });
    expect(conteudoDaBolinha(null, "")).toEqual({ tipo: "aguardando" });
  });
});

describe("bolinhasVisiveis", () => {
  it("só mostra não lidas e não encerradas, mais recente primeiro", () => {
    const r = bolinhasVisiveis(
      [
        conv({ id: "a", last_message_at: "2026-01-01" }),
        conv({ id: "b", unread_count_for_assignee: 0 }),
        conv({ id: "c", status: "closed" }),
        conv({ id: "d", last_message_at: "2026-01-03" }),
      ],
      {},
    );
    expect(r.map((c) => c.id)).toEqual(["d", "a"]);
  });
  it("dispensa vale até chegar mensagem nova", () => {
    const c = conv({ id: "a", last_message_at: "2026-01-02" });
    expect(bolinhasVisiveis([c], { a: "2026-01-02" })).toHaveLength(0);
    expect(
      bolinhasVisiveis([{ ...c, last_message_at: "2026-01-03" }], { a: "2026-01-02" }),
    ).toHaveLength(1);
  });
});

it("inicial e contador", () => {
  expect(inicialDoNome("  érica")).toBe("É");
  expect(textoDoContador(150)).toBe("99+");
});
