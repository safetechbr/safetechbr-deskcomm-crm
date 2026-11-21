/** Código IBGE do município (7 dígitos) a partir do CEP, via ViaCEP. Null se não achar ou se a consulta falhar. */
export async function codigoIbgePorCep(cep: string | null | undefined): Promise<string | null> {
  const d = (cep ?? "").replace(/\D/g, "");
  if (d.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { ibge?: string; erro?: unknown };
    return j.erro || !j.ibge || !/^\d{7}$/.test(j.ibge) ? null : j.ibge;
  } catch {
    return null;
  }
}
