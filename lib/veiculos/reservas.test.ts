import { describe, expect, it } from "vitest";
import { bloqueioDoVeiculo, reservaAtiva, reservaDeVeiculoSchema, type ReservaDeVeiculo } from "./reservas";
const agora = Date.now();
const r: ReservaDeVeiculo = { id: "r", veiculo_id: "v", vendedor_user_id: "u1", vendedor_nome: "Ana", conversation_id: "c", criada_em: new Date(agora).toISOString(), expira_em: new Date(agora + 86400000).toISOString(), visita_em: null, encerrada_em: null };
describe("reserva temporária", () => {
  it("ativa só antes do vencimento; independe de limpeza", () => {
    expect(reservaAtiva(r, agora)).toBe(true);
    expect(reservaAtiva(r, Date.parse(r.expira_em))).toBe(false);
    expect(reservaAtiva({ ...r, encerrada_em: r.criada_em }, agora)).toBe(false);
  });
  it("bloqueia outro vendedor e a IA; libera o responsável", () => {
    expect(bloqueioDoVeiculo("disponivel", r, "u2")).toContain("Ana");
    expect(bloqueioDoVeiculo("disponivel", r)).toContain("Reservado");
    expect(bloqueioDoVeiculo("disponivel", r, "u1")).toBeNull();
  });
  it("não reativa vendido nem reserva administrativa", () => {
    expect(bloqueioDoVeiculo("vendido", r, "u1")).toContain("vendido");
    expect(bloqueioDoVeiculo("reservado", null, "u1")).not.toBeNull();
  });
  it("padrão 24h, limite fechado de 1 a 24", () => {
    const base = { conversation_id: "11111111-1111-4111-8111-111111111111" };
    expect(reservaDeVeiculoSchema.parse(base).duracao_horas).toBe(24);
    for (const horas of [0, 25, 1.5]) expect(reservaDeVeiculoSchema.safeParse({ ...base, duracao_horas: horas }).success).toBe(false);
  });
});
