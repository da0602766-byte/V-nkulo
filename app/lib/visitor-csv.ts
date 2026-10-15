export function visitorCsv(rows: Record<string, string | number>[]) {
  const columns = Object.keys(rows[0] || {});
  const cell = (value: string | number | undefined) => {
    let text = String(value ?? "");
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return "\ufeff" + [columns.map(cell).join(";"), ...rows.map(row => columns.map(key => cell(row[key])).join(";"))].join("\r\n");
}
