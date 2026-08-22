"use client";
import { FormEvent, useState } from "react";

export default function PublicCellRequest({ cellId, cellName, userName = "", userEmail = "" }: { cellId: number; cellName: string; userName?: string; userEmail?: string }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget;
    try {
      const response = await fetch(`/api/public/celulas/${cellId}/solicitar`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(Object.fromEntries(new FormData(form))) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar.");
      setMessage("Pedido enviado à liderança da célula."); form.reset();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <div className="public-cell-request-v2">{!open ? <button type="button" onClick={() => setOpen(true)}>Pedir para participar</button> : <form onSubmit={submit}><header><strong>Participar de {cellName}</strong><button type="button" aria-label="Fechar" onClick={() => setOpen(false)}>×</button></header><label>Nome<input name="nome" required maxLength={120} defaultValue={userName} /></label><label>Contato<input name="contato" required maxLength={160} defaultValue={userEmail} placeholder="WhatsApp ou e-mail" /></label><label>Mensagem<textarea name="mensagem" rows={2} maxLength={500} placeholder="Conte um pouco sobre você" /></label><button disabled={busy}>{busy ? "Enviando…" : "Enviar pedido"}</button>{message && <p role="status">{message}</p>}</form>}</div>;
}
