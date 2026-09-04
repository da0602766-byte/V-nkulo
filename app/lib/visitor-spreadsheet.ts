"use client";
import { MAX_SHEET_BYTES } from "./spreadsheet-policy.mjs";

function runWorker(payload: Record<string, unknown>, transfer: Transferable[] = []) {
  return new Promise<{ rows?: Record<string, unknown>[]; buffer?: ArrayBuffer }>((resolve, reject) => {
    const worker = new Worker(new URL("./spreadsheet-worker.ts", import.meta.url), { type: "module" });
    const stop = () => { clearTimeout(timer); worker.terminate(); };
    const timer = setTimeout(() => { stop(); reject(new Error("O processamento excedeu 10 segundos. Divida a planilha em arquivos menores.")); }, 10_000);
    worker.onmessage = ({ data }) => { stop(); if (data.error) reject(new Error(data.error)); else resolve(data); };
    worker.onerror = () => { stop(); reject(new Error("Não foi possível processar a planilha.")); };
    worker.postMessage(payload, transfer);
  });
}

export async function readVisitorSpreadsheet(file: File) {
  if (file.size > MAX_SHEET_BYTES) throw new Error("Use uma planilha de até 5 MB.");
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Use Excel (.xlsx ou .xls) ou CSV.");
  const buffer = await file.arrayBuffer();
  return (await runWorker({ action: "read", buffer }, [buffer])).rows || [];
}

export async function exportVisitorSpreadsheet(rows: Record<string, string>[], filename: string) {
  const result = await runWorker({ action: "write", rows });
  const url = URL.createObjectURL(new Blob([result.buffer!], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
