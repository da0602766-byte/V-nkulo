"use client";

import { useEffect, useState } from "react";

type Schedule = { frequencia: "SEMANAL" | "MENSAL"; dias: number; proxima_execucao: string; area: string; grupo: string; situacao: string };
const endpoint = "/api/pilot/relatorios/agendamento";

export default function ReportSchedule({ filter }: { filter: { area: string; group: string; status: string } }) {
  const [schedule,setSchedule] = useState<Schedule | null>(null);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint,{ cache:"no-store",signal:controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível consultar o agendamento.");
      if (!controller.signal.aborted) setSchedule(result.schedule);
    }).catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function update(frequencia: string, dias: number) {
    setError(""); setMessage(""); setSaving(true);
    try {
      const response = await fetch(endpoint,{ method:"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ frequencia,dias,area:filter.area,grupo:filter.group,situacao:filter.status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar o agendamento.");
      setSchedule(data.schedule);
      setMessage(data.schedule ? "Agendamento salvo." : "Agendamento desativado.");
    } catch (cause) { setError((cause as Error).message); } finally { setSaving(false); }
  }

  return <div aria-busy={loading || saving}>
    <p>O resumo chega aos seus avisos às 9h de Brasília. Ao salvar, são usados a área, o grupo e a situação aplicados no histórico acima.</p>
    {loading && <p role="status">Consultando agendamento…</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!loading && <form key={schedule?.proxima_execucao ?? "new"} className="central-toolbar" onSubmit={event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      void update(String(values.get("periodicidade")),Number(values.get("dias")));
    }}>
      <label>Periodicidade<select name="periodicidade" defaultValue={schedule?.frequencia || "SEMANAL"}>
        <option value="SEMANAL">Semanal · segunda-feira</option><option value="MENSAL">Mensal · primeiro dia</option>
      </select></label>
      <label>Dias do resumo<input name="dias" type="number" defaultValue={schedule?.dias ?? 30} min={1} max={366} required /></label>
      <button type="submit" disabled={saving}>Salvar agendamento</button>
      {schedule && <button type="button" disabled={saving} onClick={() => void update("DESATIVADO",0)}>Desativar</button>}
    </form>}
    {schedule && <p>Próximo resumo em {new Date(schedule.proxima_execucao).toLocaleString("pt-BR",{ timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short" })}.</p>}
  </div>;
}
