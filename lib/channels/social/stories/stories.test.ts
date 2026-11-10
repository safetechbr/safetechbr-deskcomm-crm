import { describe, expect, it } from "vitest";
import { avaliarSlots, distribuirNoLote, gerarSlots, type JanelaDeStory, type StoryNaGrade } from "./janelas";
import {
  datasPorDiasDaSemana,
  datasPorDiasEscolhidos,
  horariosPredefinidos,
  sugerirHorario,
  validarArquivoDeStory,
} from "./regras";

const local = (a: number, m: number, d: number, h = 0, min = 0) => new Date(a, m - 1, d, h, min);
const janela: JanelaDeStory = { inicio: "08:00", fim: "09:00", intervalo_min: 15, dias_semana: [1, 2, 3, 4, 5], ativa: true };
const story = (id: string, d: Date, status: StoryNaGrade["status"] = "agendada"): StoryNaGrade => ({
  id,
  agendada_para: d.toISOString(),
  status,
});

describe("gerarSlots", () => {
  it("gera do início até antes do fim", () => {
    expect(gerarSlots("08:00", "09:00", 15)).toEqual(["08:00", "08:15", "08:30", "08:45"]);
  });
  it("janela invertida ou intervalo inválido não gera nada", () => {
    expect(gerarSlots("10:00", "08:00", 15)).toEqual([]);
    expect(gerarSlots("08:00", "09:00", 0)).toEqual([]);
  });
});

describe("avaliarSlots", () => {
  const segunda = local(2026, 11, 9); // segunda-feira
  const antes = local(2026, 11, 8, 12);

  it("dia fora dos dias da janela fica inativo", () => {
    const r = avaliarSlots(janela, local(2026, 11, 8), [], antes); // domingo
    expect(r.dia_ativo).toBe(false);
    expect(r.slots).toEqual([]);
  });
  it("marca ocupado, publicado e livre", () => {
    const r = avaliarSlots(janela, segunda, [story("a", local(2026, 11, 9, 8, 15)), story("b", local(2026, 11, 9, 8, 30), "publicada")], antes);
    expect(r.slots.map((s) => s.status)).toEqual(["livre", "ocupado", "publicado", "livre"]);
    expect(r.livres).toBe(2);
  });
  it("cancelado não bloqueia o slot", () => {
    const r = avaliarSlots(janela, segunda, [story("a", local(2026, 11, 9, 8, 15), "cancelada")], antes);
    expect(r.livres).toBe(4);
  });
  it("Story fora da grade marca o vizinho como conflito", () => {
    const r = avaliarSlots(janela, segunda, [story("a", local(2026, 11, 9, 8, 20))], antes);
    expect(r.slots[1]!.status).toBe("ocupado");
    expect(r.slots[2]!.status).toBe("conflito");
  });
  it("slots que já passaram hoje ficam como passado", () => {
    const r = avaliarSlots(janela, segunda, [], local(2026, 11, 9, 8, 20));
    expect(r.slots.map((s) => s.status)).toEqual(["passado", "passado", "livre", "livre"]);
  });
});

describe("distribuirNoLote", () => {
  it("usa só os livres, em ordem, e conta o que falta", () => {
    const r = avaliarSlots(janela, local(2026, 11, 9), [story("a", local(2026, 11, 9, 8, 0))], local(2026, 11, 8));
    const d = distribuirNoLote(["x", "y", "z", "w"], r.slots);
    expect(d.atribuicoes.map((a) => a.hora)).toEqual(["08:15", "08:30", "08:45"]);
    expect(d.cabe).toBe(false);
    expect(d.faltam).toBe(1);
  });
});

describe("repetição", () => {
  it("dias da semana: original + dias escolhidos, sem passado, no mesmo horário", () => {
    const base = local(2026, 11, 11, 9, 30); // quarta
    const d = datasPorDiasDaSemana(base, [1, 3, 5], 2);
    expect(d.map((x) => `${x.getMonth() + 1}/${x.getDate()} ${x.getHours()}:${x.getMinutes()}`)).toEqual([
      "11/11 9:30", "11/13 9:30", "11/16 9:30", "11/18 9:30", "11/20 9:30",
    ]);
  });
  it("datas escolhidas: unifica repetidas e descarta anteriores ao original", () => {
    const base = local(2026, 11, 11, 9, 30);
    const d = datasPorDiasEscolhidos(base, ["2026-11-10", "2026-11-15", "2026-11-15", "2026-11-11", "lixo"]);
    expect(d).toHaveLength(2);
    expect(d[1]!.getDate()).toBe(15);
  });
});

describe("sugerirHorario", () => {
  it("pega o primeiro horário livre da grade e pula os ocupados", () => {
    const dia = local(2026, 11, 12);
    expect(sugerirHorario(dia, [], local(2026, 11, 9)).getHours()).toBe(8);
    const ocupado = [{ agendada_para: horariosPredefinidos(dia)[0]!.toISOString(), status: "agendada" }];
    expect(sugerirHorario(dia, ocupado, local(2026, 11, 9)).getMinutes()).toBe(3);
  });
  it("hoje exige 10 minutos de folga", () => {
    const agora = local(2026, 11, 9, 8, 0);
    const s = sugerirHorario(agora, [], agora);
    expect(s.getTime()).toBeGreaterThanOrEqual(agora.getTime() + 10 * 60_000);
  });
});

describe("validarArquivoDeStory", () => {
  it("aceita imagem e vídeo dentro das regras", () => {
    expect(validarArquivoDeStory({ type: "image/png", size: 1000 })).toBeNull();
    expect(validarArquivoDeStory({ type: "video/mp4", size: 1000 }, 20)).toBeNull();
  });
  it("recusa tipo, tamanho e duração fora das regras", () => {
    expect(validarArquivoDeStory({ type: "image/gif", size: 1 })).toMatch(/JPG ou PNG/);
    expect(validarArquivoDeStory({ type: "image/png", size: 9 * 1024 * 1024 })).toMatch(/MB/);
    expect(validarArquivoDeStory({ type: "video/mp4", size: 1 }, 61)).toMatch(/máximo/);
    expect(validarArquivoDeStory({ type: "video/mp4", size: 1 }, 1)).toMatch(/mínimo/);
  });
});
