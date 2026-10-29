// SQLite's lower() only handles ASCII; normalize both sides for Portuguese names.
export function visitorSearchSql(column: string) {
  let expression = `COALESCE(${column}, '')`;
  for (const [letters, replacement] of [["áàâãäÁÀÂÃÄ", "a"], ["éèêëÉÈÊË", "e"], ["íìîïÍÌÎÏ", "i"], ["óòôõöÓÒÔÕÖ", "o"], ["úùûüÚÙÛÜ", "u"], ["çÇ", "c"], ["ñÑ", "n"]]) {
    for (const letter of letters) expression = `replace(${expression}, '${letter}', '${replacement}')`;
  }
  for (const mark of ["\u0300", "\u0301", "\u0302", "\u0303", "\u0308", "\u0327"]) expression = `replace(${expression}, '${mark}', '')`;
  return `lower(${expression})`;
}

export function visitorSearch(search: string) {
  const term = `%${search.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
  let phone = "COALESCE(telefone, '')";
  for (const char of " ()-+./") phone = `replace(${phone}, '${char}', '')`;
  const digits = search.replace(/\D/g, "");
  const clauses = ["nome_completo", "email"].map(column => `${visitorSearchSql(column)} LIKE ? ESCAPE '\\'`);
  const bindings = [term, term];
  if (digits && /^[\d\s()+./-]+$/.test(search)) { clauses.push(`${phone} LIKE ?`); bindings.push(`%${digits}%`); }
  return { sql: `(${clauses.join(" OR ")})`, bindings };
}
