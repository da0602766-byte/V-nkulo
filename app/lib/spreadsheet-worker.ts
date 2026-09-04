import * as XLSX from "xlsx";
import { checkSpreadsheetBytes, MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./spreadsheet-policy.mjs";

self.onmessage = (event: MessageEvent) => {
  try {
    if (event.data.action === "read") {
      checkSpreadsheetBytes(event.data.buffer);
      const workbook = XLSX.read(event.data.buffer, { type: "array", cellDates: true,
        sheetRows: MAX_SHEET_ROWS + 2, sheets: 0, cellFormula: false, cellHTML: false, cellStyles: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("A planilha está vazia.");
      const range = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"] || "A1");
      if (range.e.r >= MAX_SHEET_ROWS + 1 || range.e.c >= MAX_SHEET_COLUMNS)
        throw new Error("Use no máximo 2.000 linhas de dados e 64 colunas por importação.");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      self.postMessage({ rows });
    } else {
      const rows = event.data.rows as Record<string, string>[];
      if (rows.length > MAX_SHEET_ROWS) throw new Error("Exporte até 2.000 pessoas por vez usando os filtros.");
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet["!cols"] = Array.from({ length: 9 }, () => ({ wch: 24 }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Visitantes");
      const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true });
      self.postMessage({ buffer }, { transfer: [buffer] });
    }
  } catch (error) { self.postMessage({ error: (error as Error).message }); }
};
