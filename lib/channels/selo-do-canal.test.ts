import { describe, expect, it } from "vitest";
import { seloDoCanal } from "./selo-do-canal";

describe("seloDoCanal", () => {
  it("reconhece os canais de conversa", () => {
    expect(seloDoCanal("instagram")?.rotulo).toBe("Instagram");
    expect(seloDoCanal("facebook")?.sigla).toBe("FB");
  });
  it("WhatsApp do operador e recebido têm o mesmo selo", () => {
    expect(seloDoCanal("whatsapp_operador")).toEqual(seloDoCanal("whatsapp"));
  });
  it("origem que não é canal não ganha selo", () => {
    expect(seloDoCanal("manual")).toBeNull();
    expect(seloDoCanal("meta_ads")).toBeNull();
    expect(seloDoCanal(undefined)).toBeNull();
  });
});

import { canalDoLead, rotuloDoCanal } from "./selo-do-canal";
import { applyFilters, filtersFromParams, filtersToParams } from "@/lib/kanban/filters";

describe("filtro por canal", () => {
  it("agrupa whatsapp e whatsapp_operador", () => {
    expect(canalDoLead("whatsapp_operador")).toBe("WA");
    expect(canalDoLead("instagram")).toBe("IG");
    expect(canalDoLead("manual")).toBeNull();
    expect(rotuloDoCanal("IG")).toBe("Instagram");
  });
  it("filtra leads e serializa na URL", () => {
    const leads = [
      { id: "1", title: "a", source: "instagram", status: "open" },
      { id: "2", title: "b", source: "whatsapp", status: "open" },
      { id: "3", title: "c", source: "manual", status: "open" },
    ] as never[];
    expect(applyFilters(leads, { channel: "IG" }).map((l) => l.id)).toEqual(["1"]);
    expect(applyFilters(leads, {}).length).toBe(3);
    const qs = filtersToParams({ channel: "WA" });
    expect(qs).toBe("canal=WA");
    expect(filtersFromParams(new URLSearchParams(qs)).channel).toBe("WA");
  });
});
