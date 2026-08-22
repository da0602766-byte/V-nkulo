import { notFound } from "next/navigation";
import { getD1 } from "../../../db";
import SharedScheduleAccessGate from "../../components/SharedScheduleAccessGate";
import SharedSchedulePendingState from "../../components/SharedSchedulePendingState";
import { getSecretaryScheduleDetail } from "../../lib/secretary-schedule";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SharedSchedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const token = (await params).token;
  if (!/^[a-f0-9]{32}$/i.test(token)) notFound();
  const db = getD1();
  const row = await db
    .prepare(
      `SELECT id, comunidade_id, compartilhado_em FROM escalas_ministerio
       WHERE share_token = ? AND status = 'PUBLICADA'
       LIMIT 1`,
    )
    .bind(token)
    .first<{ id: number; comunidade_id: number; compartilhado_em: string | null }>();
  if (!row) notFound();
  const accessRow = await db
    .prepare(
      `SELECT
         (SELECT valor FROM configuracoes WHERE chave = ? LIMIT 1) AS valor,
         CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS now_ms`,
    )
    .bind(`schedule_share_access:${row.comunidade_id}:${row.id}`)
    .first<{ valor: string | null; now_ms: number }>();
  const now = Number(accessRow?.now_ms || 0);
  const accessWindow = parseAccessWindow(accessRow?.valor || undefined, row.compartilhado_em, now);
  if (now < accessWindow.opensAt) {
    return (
      <SharedSchedulePendingState
        opensAt={new Date(accessWindow.opensAt).toISOString()}
        serverNow={now}
      />
    );
  }
  if (now > accessWindow.closesAt) {
    return <SharedAccessState title="Acesso temporário encerrado" detail="Solicite ao líder um novo link caso ainda precise consultar esta escala." />;
  }
  const schedule = await getSecretaryScheduleDetail(db, Number(row.id));
  if (!schedule) notFound();
  return (
    <SharedScheduleAccessGate
      opensAt={new Date(accessWindow.opensAt).toISOString()}
      closesAt={new Date(accessWindow.closesAt).toISOString()}
    >
      <main className="shared-secretary-page" id="conteudo-escala">
        <header>
          <span className="shared-secretary-brand">V+</span>
          <div>
            <p>VÍNKULO · SECRETARIA MINISTERIAL</p>
            <strong>Escala compartilhada</strong>
          </div>
        </header>
        <section className="shared-secretary-hero">
          <p>{schedule.comunidade_nome}</p>
          <h1>{schedule.titulo}</h1>
          <span>{schedule.ministerio_nome}</span>
          <dl>
            <div><dt>Início</dt><dd>{formatDate(schedule.inicia_em)}</dd></div>
            <div><dt>Término</dt><dd>{formatDate(schedule.termina_em)}</dd></div>
            <div><dt>Local</dt><dd>{schedule.local || "Não informado"}</dd></div>
            <div><dt>Responsável</dt><dd>{schedule.responsavel_nome || "Não definido"}</dd></div>
          </dl>
        </section>
        <div className="shared-secretary-grid">
          <section>
            <p className="pilot-kicker">EQUIPE</p>
            <h2>Integrantes escalados</h2>
            <ul>
              {schedule.designacoes.map((item) => (
                <li key={String(item.id)}>
                  <strong>{String(item.nome)}</strong>
                  <span>{String(item.funcao)} · {statusLabel(item.status)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <p className="pilot-kicker">REPERTÓRIO</p>
            <h2>Conteúdo preparado</h2>
            {schedule.repertorio.length ? (
              <ol>{schedule.repertorio.map((item) => <li key={item}>{item}</li>)}</ol>
            ) : <p>Nenhum item informado.</p>}
          </section>
          <section>
            <p className="pilot-kicker">CHECKLIST</p>
            <h2>Responsabilidades</h2>
            <ul>
              {schedule.checklist.map((item) => (
                <li key={String(item.id)}>
                  <strong>{String(item.tarefa)}</strong>
                  <span>{String(item.responsavel_nome || "Equipe")} · {statusLabel(item.status)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <p className="pilot-kicker">LINKS</p>
            <h2>Materiais e recursos</h2>
            <div className="shared-secretary-links">
              {schedule.links_recursos.map((item) => (
                <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
                  {item.titulo}<span>{item.tipo.replaceAll("_", " ")}</span>
                </a>
              ))}
            </div>
          </section>
        </div>
        <footer>Visualização somente leitura · nenhum dado de contato é exibido.</footer>
      </main>
    </SharedScheduleAccessGate>
  );
}

function SharedAccessState({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="shared-secretary-page shared-secretary-access-state">
      <section>
        <span className="shared-secretary-brand">V+</span>
        <p>VÍNKULO · ACESSO TEMPORÁRIO</p>
        <h1>{title}</h1>
        <p>{detail}</p>
      </section>
    </main>
  );
}

function parseAccessWindow(raw: string | undefined, sharedAt: string | null, now: number) {
  try {
    const parsed = JSON.parse(raw || "{}") as { abreEm?: string; fechaEm?: string };
    const opensAt = Date.parse(String(parsed.abreEm || ""));
    const closesAt = Date.parse(String(parsed.fechaEm || ""));
    if (Number.isFinite(opensAt) && Number.isFinite(closesAt) && closesAt > opensAt) {
      return { opensAt, closesAt };
    }
  } catch {
    // Links legados recebem uma janela conservadora abaixo.
  }
  const legacyStart = parseSqliteDate(sharedAt) || now;
  return { opensAt: legacyStart, closesAt: legacyStart + 7 * 24 * 60 * 60 * 1000 };
}

function parseSqliteDate(value: string | null) {
  if (!value) return 0;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function statusLabel(value: unknown) {
  return (
    {
      PENDENTE: "Pendente",
      CONFIRMADA: "Confirmada",
      INDISPONIVEL: "Indisponível",
      FEITO: "Feito",
      NAO_FEITO: "Não feito",
    }[String(value || "")] || String(value || "")
  );
}
