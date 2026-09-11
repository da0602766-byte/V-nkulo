const CP1252: Record<string, number> = {
  "€": 128, "‚": 130, "ƒ": 131, "„": 132, "…": 133, "†": 134,
  "‡": 135, "ˆ": 136, "‰": 137, "Š": 138, "‹": 139, "Œ": 140,
  "Ž": 142, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149,
  "–": 150, "—": 151, "˜": 152, "™": 153, "š": 154, "›": 155,
  "œ": 156, "ž": 158, "Ÿ": 159,
};

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[^\u0020-\u007e\u00a0-\u00ff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ\n]/g, "-");
}

function pdfText(value: unknown) {
  return clean(value).replace(/([\\()])/g, "\\$1");
}

function wrap(value: unknown, limit = 82) {
  const paragraphs = clean(value).split("\n");
  const result: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      result.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      if (word.length > limit) {
        if (current) result.push(current);
        for (let index = 0; index < word.length; index += limit)
          result.push(word.slice(index, index + limit));
        current = "";
      } else if (!current || `${current} ${word}`.length <= limit) {
        current = current ? `${current} ${word}` : word;
      } else {
        result.push(current);
        current = word;
      }
    }
    if (current) result.push(current);
  }
  return result;
}

function encodeBinary(value: string) {
  const bytes: number[] = [];
  for (const char of value) {
    const code = char.charCodeAt(0);
    bytes.push(code <= 255 ? code : (CP1252[char] ?? 45));
  }
  return new Uint8Array(bytes);
}

export function createSimplePdf(title: string, lines: string[]) {
  const safeTitle = clean(title).slice(0, 110) || "Relatório";
  const wrapped = lines.flatMap((line) => wrap(line));
  const pageSize = 40;
  const pages = Array.from(
    { length: Math.max(1, Math.ceil(wrapped.length / pageSize)) },
    (_, index) => wrapped.slice(index * pageSize, (index + 1) * pageSize),
  );
  const pageIds = pages.map((_, index) => 5 + index * 2);
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];

  pages.forEach((pageLines, pageIndex) => {
    const pageId = pageIds[pageIndex];
    const contentId = pageId + 1;
    const stream = [
      "q", "0.075 0.42 0.40 rg", "0 790 595 52 re f", "Q",
      "BT", "/F2 17 Tf", "1 1 1 rg", "42 812 Td", `(${pdfText(safeTitle)}) Tj`, "ET",
      "BT", "/F1 10 Tf", "0.12 0.16 0.20 rg", "46 758 Td",
      ...pageLines.flatMap((line) => [`(${pdfText(line)}) Tj`, "0 -16 Td"]),
      "ET",
      "BT", "/F1 8 Tf", "0.42 0.47 0.50 rg", "46 28 Td",
      `(Sinergia - Página ${pageIndex + 1} de ${pages.length}) Tj`, "ET",
    ].join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
      `<< /Length ${encodeBinary(stream).length} >>\nstream\n${stream}\nendstream`,
    );
  });

  let pdf = "%PDF-1.4\n%âãÏÓ\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encodeBinary(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = encodeBinary(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return encodeBinary(pdf);
}

export function pdfResponse(filename: string, title: string, lines: string[], download = true) {
  return new Response(createSimplePdf(title, lines), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
