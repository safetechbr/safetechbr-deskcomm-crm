import { describe, expect, it } from "vitest";

import {
  avaliarSilencio,
  emHorarioComercial,
  MAXIMO_DE_REINICIOS,
  SEM_REINICIOS,
  type EntradaDoSilencio,
} from "./silencio";

// Terça 2026-11-10 15:00 em São Paulo (UTC-3) = 18:00Z.
const AGORA = new Date("2026-11-10T18:00:00Z");
const h = (horas: number) => new Date(AGORA.getTime() - horas * 3_600_000);

const base: EntradaDoSilencio = {
  status: "WORKING",
  ultimaEntradaEm: h(3),
  agora: AGORA,
  estado: SEM_REINICIOS,
  envioEmAndamento: false,
};

describe("avaliarSilencio", () => {
  it("reinicia sessão WORKING muda em horário comercial", () => {
    expect(avaliarSilencio(base)).toMatchObject({ acao: "avisar_e_reiniciar", tentativa: 1 });
  });

  it("nunca age em sessão que não é WORKING", () => {
    for (const status of ["FAILED", "SCAN_QR_CODE", "STOPPED"]) {
      expect(avaliarSilencio({ ...base, status })).toEqual({ acao: "ignorar", motivo: "status" });
    }
  });

  it("abaixo do limiar é normal", () => {
    expect(avaliarSilencio({ ...base, ultimaEntradaEm: h(1) })).toEqual({ acao: "normal" });
  });

  it("conta sem entrada na última semana é quieta, não surda", () => {
    expect(avaliarSilencio({ ...base, ultimaEntradaEm: h(24 * 8) })).toMatchObject({ motivo: "conta_quieta" });
    expect(avaliarSilencio({ ...base, ultimaEntradaEm: null })).toMatchObject({ motivo: "conta_quieta" });
  });

  it("fora do horário comercial não alarma", () => {
    const noite = new Date("2026-11-11T02:00:00Z"); // 23h em SP
    expect(avaliarSilencio({ ...base, agora: noite, ultimaEntradaEm: new Date("2026-11-10T20:00:00Z") })).toMatchObject({
      motivo: "fora_do_horario",
    });
  });

  it("manhã seguinte não acusa a noite como silêncio", () => {
    const manha = new Date("2026-11-11T11:00:00Z"); // 08h em SP
    expect(avaliarSilencio({ ...base, agora: manha, ultimaEntradaEm: new Date("2026-11-10T21:00:00Z") })).toEqual({
      acao: "normal",
    });
  });

  it("respeita o intervalo de 30 min entre reinícios", () => {
    const estado = { tentativas: 1, ultima_tentativa_em: new Date(AGORA.getTime() - 10 * 60_000).toISOString() };
    expect(avaliarSilencio({ ...base, estado })).toMatchObject({ acao: "so_avisar", motivo: "cooldown" });
    const velho = { tentativas: 1, ultima_tentativa_em: new Date(AGORA.getTime() - 31 * 60_000).toISOString() };
    expect(avaliarSilencio({ ...base, estado: velho })).toMatchObject({ acao: "avisar_e_reiniciar", tentativa: 2 });
  });

  it("para no teto de tentativas e só avisa", () => {
    const estado = { tentativas: MAXIMO_DE_REINICIOS, ultima_tentativa_em: h(5).toISOString() };
    expect(avaliarSilencio({ ...base, estado })).toMatchObject({ acao: "so_avisar", motivo: "teto_de_tentativas" });
  });

  it("não reinicia com envio em andamento", () => {
    expect(avaliarSilencio({ ...base, envioEmAndamento: true })).toMatchObject({
      acao: "so_avisar",
      motivo: "envio_em_andamento",
    });
  });
});

describe("emHorarioComercial", () => {
  it("domingo fecha; sábado 10h abre; 20h fecha", () => {
    expect(emHorarioComercial(new Date("2026-11-08T15:00:00Z"))).toBe(false); // domingo
    expect(emHorarioComercial(new Date("2026-11-14T13:00:00Z"))).toBe(true); // sábado 10h
    expect(emHorarioComercial(new Date("2026-11-10T23:00:00Z"))).toBe(false); // 20h
  });
});
