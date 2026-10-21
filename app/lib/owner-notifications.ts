// Applied in SQL before pagination/counting, including notices saved before this rule.
// Keep operational notices tied to the same session permission as /proprietario.
export function notificationVisibilitySql(owner: boolean, alias = "n") {
  return owner ? "1 = 1" : `NOT (${ownerNotificationSql(alias)})`;
}

export function ownerNotificationSql(alias = "n") {
  return `(lower(trim(COALESCE(${alias}.destino_rota, ''))) LIKE '/proprietario%'
    OR ${alias}.titulo = 'Falha na sincronização Supabase')`;
}
