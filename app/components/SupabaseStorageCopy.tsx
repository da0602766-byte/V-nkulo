"use client";

import { useCallback, useEffect, useState } from "react";

type Result = { scanned: number; copied: number; verified: number; skipped: number; nextCursor: string | null };

export default function SupabaseStorageCopy() {
  const [cursor, setCursor] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copies, setCopies] = useState<number | null>(null);
  const [total, setTotal] = useState({ scanned: 0, copied: 0, verified: 0, skipped: 0 });

  const refreshCopies = useCallback(async () => {
    const response = await fetch("/api/proprietario/integracoes/supabase/storage-copy", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { copies?: number };
    if (typeof data.copies === "number") setCopies(data.copies);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void refreshCopies().catch(() => {}); }, 0);
    return () => clearTimeout(timer);
  }, [refreshCopies]);

  async function copyPage() {
    if (!started && !window.confirm("Copiar imagens do R2 para o bucket privado configurado no Supabase? Os arquivos originais serão preservados e cada cópia será conferida.")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/proprietario/integracoes/supabase/storage-copy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, cursor }),
      });
      const data = await response.json() as { error?: string; result?: Result };
      if (!response.ok || !data.result) throw new Error(data.error || "A cópia não foi confirmada.");
      setStarted(true);
      setCursor(data.result.nextCursor);
      await refreshCopies();
      setTotal(previous => ({
        scanned: previous.scanned + data.result!.scanned,
        copied: previous.copied + data.result!.copied,
        verified: previous.verified + data.result!.verified,
        skipped: previous.skipped + data.result!.skipped,
      }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível copiar os arquivos.");
    } finally { setBusy(false); }
  }

  async function rollback() {
    if (!window.confirm("Remover do Supabase até 20 cópias já conferidas nesta etapa? Cada original no R2 será verificado antes da remoção.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/proprietario/integracoes/supabase/storage-copy", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "REMOVER_COPIAS_SUPABASE" }),
      });
      const data = await response.json() as { error?: string; result?: { removed: number; remaining: number } };
      if (!response.ok || !data.result) throw new Error(data.error || "A remoção não foi confirmada.");
      setCopies(data.result.remaining);
      setNotice(`${data.result.removed} cópia(s) removida(s); ${data.result.remaining} restante(s).`);
      if (!data.result.remaining) { setStarted(false); setCursor(null); setTotal({ scanned: 0, copied: 0, verified: 0, skipped: 0 }); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível remover as cópias."); }
    finally { setBusy(false); }
  }

  return <section className="publication-panel" aria-busy={busy}>
    <h3>Imagens no Supabase Storage</h3>
    <p>Copie as imagens hospedadas no R2. A rotina confere o conteúdo, preserva a origem e interrompe se encontrar um arquivo diferente com o mesmo nome. Configure antes um bucket privado na conexão.</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {copies !== null && <p>{copies} imagem(ns) registrada(s) no Supabase.</p>}
    {started && <p role="status">{total.scanned} objetos examinados · {total.copied} copiados · {total.verified} já conferidos · {total.skipped} fora do escopo desta cópia. {cursor ? "Há outra página." : "Inventário concluído."}</p>}
    {(!started || cursor) && <button type="button" disabled={busy} onClick={() => void copyPage()}>{busy ? "Copiando…" : started ? "Copiar próxima página" : "Iniciar cópia conferida"}</button>}
    {Boolean(copies) && <button type="button" className="secondary" disabled={busy} onClick={() => void rollback()}>Desfazer até 20 cópias</button>}
  </section>;
}
