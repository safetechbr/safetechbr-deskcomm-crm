/**
 * Janelas de horário dos Stories: uma janela é um intervalo do dia (ex.: 08:00–10:00)
 * dividido em slots de N minutos. Porta da lógica do PostPlan, em português.
 *
 * ⚠️ PURO e em HORA LOCAL do navegador (como o PostPlan): `Date` entra por parâmetro,
 * nada lê relógio. O servidor só recebe instantes ISO já resolvidos.
 */

export type StatusDoStory = "agendada" | "publicando" | "publicada" | "falhou" | "cancelada";

export type StoryNaGrade = { id: string; agendada_para: string; status: StatusDoStory };

export type JanelaDeStory = {
  inicio: string; // "HH:mm"
  fim: string; // "HH:mm"
  intervalo_min: number;
  dias_semana: number[]; // 0 = domingo … 6 = sábado
  ativa: boolean;
};

export type StatusDoSlot = "livre" | "ocupado" | "publicado" | "falhou" | "conflito" | "passado";

export type SlotAvaliado<T extends StoryNaGrade = StoryNaGrade> = {
  hora: string;
  minutos: number;
  status: StatusDoSlot;
  story?: T;
  conflito_com?: T;
};

export function horaParaMinutos(hora: string): number {
  if (!hora || typeof hora !== "string") return 0;
  const [h, m] = hora.split(":");
  return (parseInt(h ?? "", 10) || 0) * 60 + (parseInt(m ?? "", 10) || 0);
}

export function minutosParaHora(minutos: number): string {
  const n = Math.max(0, minutos);
  return `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

/** Chave local do dia, `YYYY-MM-DD`. */
export function chaveDoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Horários da janela: do início até antes do fim, de `intervalo` em `intervalo` minutos. */
export function gerarSlots(inicio: string, fim: string, intervaloMin: number): string[] {
  if (!inicio || !fim || !Number.isInteger(intervaloMin) || intervaloMin <= 0) return [];
  const a = horaParaMinutos(inicio);
  const b = horaParaMinutos(fim);
  if (b <= a) return [];
  const slots: string[] = [];
  for (let m = a; m < b; m += intervaloMin) slots.push(minutosParaHora(m));
  return slots;
}

export type AvaliacaoDaJanela<T extends StoryNaGrade = StoryNaGrade> = {
  dia_ativo: boolean;
  slots: SlotAvaliado<T>[];
  total: number;
  livres: number;
  ocupados: number;
  stories_na_janela: T[];
};

/** Avalia cada slot da janela num dia: livre, ocupado, publicado, falhou, conflito ou passado. */
export function avaliarSlots<T extends StoryNaGrade>(
  janela: JanelaDeStory,
  dia: Date,
  doDia: T[],
  agora: Date = new Date(),
): AvaliacaoDaJanela<T> {
  const diaAtivo = janela.ativa && janela.dias_semana.includes(dia.getDay());
  const ini = horaParaMinutos(janela.inicio);
  const fim = horaParaMinutos(janela.fim);
  const minutoDe = (s: T) => {
    const d = new Date(s.agendada_para);
    return d.getHours() * 60 + d.getMinutes();
  };
  const naJanela = doDia.filter((s) => {
    const m = minutoDe(s);
    return m >= ini && m < fim;
  });
  if (!diaAtivo)
    return { dia_ativo: false, slots: [], total: 0, livres: 0, ocupados: 0, stories_na_janela: naJanela };

  const horas = gerarSlots(janela.inicio, janela.fim, janela.intervalo_min);
  const passouDia = chaveDoDia(dia) < chaveDoDia(agora);
  const ehHoje = chaveDoDia(dia) === chaveDoDia(agora);
  const agoraMin = agora.getHours() * 60 + agora.getMinutes();

  const diretos = new Map<string, T>();
  const conflitos = new Map<string, T>();
  for (const story of naJanela.filter((s) => s.status !== "cancelada")) {
    const m = minutoDe(story);
    let maisProximo: string | null = null;
    let menor = Infinity;
    for (const h of horas) {
      const dist = Math.abs(horaParaMinutos(h) - m);
      if (dist < janela.intervalo_min && dist < menor) {
        menor = dist;
        maisProximo = h;
      }
    }
    if (maisProximo && !diretos.has(maisProximo)) diretos.set(maisProximo, story);
    for (const h of horas) {
      if (h === maisProximo) continue;
      if (Math.abs(horaParaMinutos(h) - m) < janela.intervalo_min && !conflitos.has(h)) conflitos.set(h, story);
    }
  }

  const slots: SlotAvaliado<T>[] = horas.map((hora) => {
    const minutos = horaParaMinutos(hora);
    const direto = diretos.get(hora);
    if (direto) {
      const status: StatusDoSlot =
        direto.status === "publicada" ? "publicado" : direto.status === "falhou" ? "falhou" : "ocupado";
      return { hora, minutos, status, story: direto };
    }
    const conflito = conflitos.get(hora);
    if (conflito) return { hora, minutos, status: "conflito", conflito_com: conflito };
    if (passouDia || (ehHoje && minutos < agoraMin)) return { hora, minutos, status: "passado" };
    return { hora, minutos, status: "livre" };
  });

  return {
    dia_ativo: true,
    slots,
    total: slots.length,
    livres: slots.filter((s) => s.status === "livre").length,
    ocupados: slots.filter((s) => ["ocupado", "conflito", "publicado", "falhou"].includes(s.status)).length,
    stories_na_janela: naJanela,
  };
}

/** Distribui itens (ordem do envio) nos primeiros slots livres. Sobra vira `faltam`. */
export function distribuirNoLote<T>(itens: T[], slots: SlotAvaliado[]) {
  const livres = slots.filter((s) => s.status === "livre");
  const n = Math.min(itens.length, livres.length);
  return {
    atribuicoes: itens.slice(0, n).map((item, index) => ({ hora: livres[index]!.hora, item, index })),
    cabe: livres.length >= itens.length,
    faltam: Math.max(0, itens.length - livres.length),
  };
}
