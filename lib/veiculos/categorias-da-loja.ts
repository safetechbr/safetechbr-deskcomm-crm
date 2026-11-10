import type { SupabaseClient } from "@supabase/supabase-js";

import { CATEGORIAS_PADRAO, listaDeCategorias, mesmaCategoria } from "./categorias";

/** Categorias que a loja acrescentou à lista padrão. */
export async function categoriasDaLoja(supabase: SupabaseClient, orgId: string): Promise<string[]> {
  const { data } = await supabase
    .from("veiculo_categorias")
    .select("nome")
    .eq("organization_id", orgId)
    .order("nome");
  return (data ?? []).map((l) => l.nome as string);
}

/** Lista completa para o seletor: padrão + as da loja. */
export async function categoriasParaSeletor(supabase: SupabaseClient, orgId: string): Promise<string[]> {
  return listaDeCategorias(await categoriasDaLoja(supabase, orgId));
}

/**
 * Guarda a categoria na lista da loja quando ela ainda não existe (padrão ou
 * da loja). Falha em silêncio: o veículo já está salvo, e a categoria fica
 * gravada nele de qualquer jeito.
 */
export async function registrarCategoriaDaLoja(
  supabase: SupabaseClient,
  orgId: string,
  categoria: string,
): Promise<void> {
  const nome = categoria.trim();
  if (!nome || CATEGORIAS_PADRAO.some((c) => mesmaCategoria(c, nome))) return;
  await supabase.from("veiculo_categorias").insert({ organization_id: orgId, nome });
}
