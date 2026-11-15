/**
 * Leva o operador ao campo de uma pendência e o deixa vermelho até ser editado.
 *
 * Os campos do PDV declaram `data-campo="<onde>.<campo>"` (ex.: `cliente.numero`,
 * `contrato.entrega_em`), a mesma chave de `FaltaParaConcluir`.
 */

const DESTAQUE = ["ring-2", "ring-destructive", "border-destructive", "bg-destructive/5"];
const FOCAVEL = "input, select, textarea";

let limparAnterior: (() => void) | null = null;

function valorDe(el: Element): string {
  const campo = el.matches(FOCAVEL) ? el : el.querySelector(FOCAVEL);
  return campo instanceof HTMLInputElement ||
    campo instanceof HTMLSelectElement ||
    campo instanceof HTMLTextAreaElement
    ? campo.value.trim()
    : "";
}

/**
 * Acha o campo da chave dentro de `raiz`; com vários (ex.: um por pagamento), prefere o vazio.
 * Sem chave (ou sem campo da chave na tela, ex.: ficha do veículo antes de escolher do
 * estoque), cai no primeiro inválido de `raiz` e, por fim, no primeiro campo vazio dela.
 */
export function acharCampo(raiz: ParentNode, chave?: string): HTMLElement | null {
  if (chave) {
    const todos = [...raiz.querySelectorAll<HTMLElement>(`[data-campo="${CSS.escape(chave)}"]`)];
    const alvo = todos.find((el) => valorDe(el) === "") ?? todos[0];
    if (alvo) return alvo;
  }
  const marcados = [...raiz.querySelectorAll<HTMLElement>("[data-campo]")];
  return (
    raiz.querySelector<HTMLElement>('[aria-invalid="true"]') ??
    marcados.find((el) => valorDe(el) === "") ??
    marcados[0] ??
    null
  );
}

/** Rola até o campo, foca e o marca de vermelho até a próxima edição dele. */
export function destacarCampo(alvo: HTMLElement) {
  limparAnterior?.();
  const pai = alvo.closest("details");
  if (pai) pai.open = true;
  const foco = alvo.matches(FOCAVEL) ? alvo : alvo.querySelector<HTMLElement>(FOCAVEL);
  // Campo de dinheiro: a borda é da moldura, não do input.
  const moldura =
    foco && foco !== alvo ? alvo : (foco?.closest<HTMLElement>("[data-moldura]") ?? alvo);
  moldura.classList.add(...DESTAQUE);
  moldura.setAttribute("data-destacado", "true");
  alvo.scrollIntoView({ behavior: "smooth", block: "center" });
  foco?.focus({ preventScroll: true });
  const limpar = () => {
    moldura.classList.remove(...DESTAQUE);
    moldura.removeAttribute("data-destacado");
    (foco ?? alvo).removeEventListener("input", limpar);
    (foco ?? alvo).removeEventListener("change", limpar);
    if (limparAnterior === limpar) limparAnterior = null;
  };
  (foco ?? alvo).addEventListener("input", limpar);
  (foco ?? alvo).addEventListener("change", limpar);
  limparAnterior = limpar;
}
