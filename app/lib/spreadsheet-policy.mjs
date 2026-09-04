export const MAX_SHEET_BYTES = 5 * 1024 * 1024;
export const MAX_SHEET_ROWS = 2000;
export const MAX_SHEET_COLUMNS = 64;

export function checkSpreadsheetBytes(buffer) {
  if (!buffer.byteLength || buffer.byteLength > MAX_SHEET_BYTES) throw new Error('Use uma planilha de até 5 MB.');
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint32(0, true) !== 0x04034b50) return;
  // Reject ZIP bombs before the parser allocates their decompressed contents.
  let end = view.byteLength - 22;
  const minimum = Math.max(0, end - 65535);
  while (end >= minimum && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < minimum) throw new Error('Arquivo Excel inválido.');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true), expanded = 0;
  if (count > 2000) throw new Error('Planilha com muitos arquivos internos.');
  for (let i = 0; i < count; i++) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error('Arquivo Excel inválido.');
    expanded += view.getUint32(offset + 24, true);
    if (expanded > 25 * 1024 * 1024) throw new Error('A planilha descompactada ultrapassa 25 MB.');
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
}
