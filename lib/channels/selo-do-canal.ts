/**
 * O SELO DA PLATAFORMA no cartão do funil: de qual rede o negócio veio.
 *
 * Lê `crm_leads.source` (vocabulário aberto, gravado no nascimento do lead por
 * `origemDoNegocioPeloCanal`). Origem que não é um canal de conversa (manual,
 * anúncio, planilha, site…) não ganha selo: melhor nenhum selo do que um errado.
 * Rede nova no catálogo social aparece aqui com uma linha.
 */
export interface SeloDoCanal {
  /** Nome por extenso (tooltip e leitor de tela). */
  rotulo: string;
  /** Sigla curta desenhada no selo. */
  sigla: string;
  /** Classes de cor do selo. */
  classe: string;
}

const SELOS: Record<string, SeloDoCanal> = {
  whatsapp: { rotulo: "WhatsApp", sigla: "WA", classe: "bg-[#25D366] text-white" },
  whatsapp_operador: { rotulo: "WhatsApp", sigla: "WA", classe: "bg-[#25D366] text-white" },
  instagram: {
    rotulo: "Instagram",
    sigla: "IG",
    classe: "bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white",
  },
  facebook: { rotulo: "Facebook", sigla: "FB", classe: "bg-[#1877F2] text-white" },
};

export function seloDoCanal(source: string | null | undefined): SeloDoCanal | null {
  return source ? (SELOS[source] ?? null) : null;
}

/**
 * A chave do canal para filtrar: "whatsapp" e "whatsapp_operador" são o mesmo
 * canal. Origem sem selo (manual, anúncio…) não tem canal.
 */
export function canalDoLead(source: string | null | undefined): string | null {
  const selo = seloDoCanal(source);
  return selo ? selo.sigla : null;
}

/** Rótulo de um canal a partir da chave devolvida por `canalDoLead`. */
export function rotuloDoCanal(chave: string): string {
  const selo = Object.values(SELOS).find((s) => s.sigla === chave);
  return selo?.rotulo ?? chave;
}
