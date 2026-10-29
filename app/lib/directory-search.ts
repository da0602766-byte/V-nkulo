/** Busca pública tolerante a acentos, espaços e diferenças de caixa. */
export function matchesDirectorySearch(search: string, ...fields: Array<string | null | undefined>): boolean {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
  const term = normalize(search);
  return !term || fields.some((field) => field != null && normalize(field).includes(term));
}
