/** NCM padrão por categoria: só sugestão; o veículo guarda o NCM final. */
export function ncmPadraoDaCategoria(categoria: string | null | undefined): string {
  const c = (categoria ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
  if (c === "moto" || c === "motocicleta") return "87110000";
  // Utilitário de carga: picape, furgão/utilitário e van.
  if (["picape", "utilitario", "van"].includes(c)) return "87040000";
  return "87030000";
}
