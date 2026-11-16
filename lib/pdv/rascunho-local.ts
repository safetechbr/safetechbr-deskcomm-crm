/** Cópia local da venda em andamento: protege contra recarregar a página ou sessão expirada. */
const VERSAO = 1;
const VALIDADE_MS = 7 * 86_400_000;

export interface RascunhoGuardado<T> {
  v: number;
  salvoEm: string;
  aba: "venda" | "compra";
  /** Negociação já salva no servidor (rascunho) que estava aberta, se houver. */
  abertaId: string | null;
  r: T;
}

const chave = (usuarioId: string) => `pdv:rascunho:${usuarioId}`;

function armazenamento(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Só vale guardar quando há algo que o usuário digitou ou escolheu. */
export function temConteudo(r: unknown): boolean {
  const o = r as {
    contact_id?: string | null;
    veiculo_id?: string | null;
    cliente?: Record<string, unknown>;
    veiculo?: Record<string, unknown>;
    valor_cents?: number;
    desconto_cents?: number;
    troca?: unknown;
    pagamentos?: unknown[];
    observacoes?: string | null;
  };
  const preenchido = (x?: Record<string, unknown>) =>
    Object.values(x ?? {}).some((v) => (typeof v === "string" ? v.trim() !== "" : v != null));
  return Boolean(
    o.contact_id ||
      o.veiculo_id ||
      preenchido(o.cliente) ||
      preenchido(o.veiculo) ||
      (o.valor_cents ?? 0) > 0 ||
      (o.desconto_cents ?? 0) > 0 ||
      o.troca ||
      (o.pagamentos?.length ?? 0) > 0 ||
      o.observacoes?.trim(),
  );
}

export function guardarRascunho<T>(
  usuarioId: string,
  dados: Omit<RascunhoGuardado<T>, "v" | "salvoEm">,
): void {
  const s = armazenamento();
  if (!s) return;
  try {
    const g: RascunhoGuardado<T> = { v: VERSAO, salvoEm: new Date().toISOString(), ...dados };
    s.setItem(chave(usuarioId), JSON.stringify(g));
  } catch {
    // Cota cheia ou modo privado: o PDV continua funcionando sem a cópia local.
  }
}

export function lerRascunho<T>(usuarioId: string): RascunhoGuardado<T> | null {
  const s = armazenamento();
  if (!s) return null;
  try {
    const bruto = s.getItem(chave(usuarioId));
    if (!bruto) return null;
    const g = JSON.parse(bruto) as RascunhoGuardado<T>;
    const idade = Date.now() - Date.parse(g.salvoEm);
    if (g.v !== VERSAO || !(idade < VALIDADE_MS) || !g.r || !temConteudo(g.r)) {
      s.removeItem(chave(usuarioId));
      return null;
    }
    return g;
  } catch {
    return null;
  }
}

export function limparRascunho(usuarioId: string): void {
  try {
    armazenamento()?.removeItem(chave(usuarioId));
  } catch {
    /* sem armazenamento */
  }
}
