import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("o encontro por equipe é persistido, validado e devolvido pela escala", () => {
  const migration = read("drizzle/0074_encontro_equipes_alertas.sql");
  const schema = read("db/schema.ts");
  const validation = read("app/lib/ministry-validation.ts");
  const schedules = read("app/api/pilot/escalas/route.ts");
  const schedule = read("app/api/pilot/escalas/[id]/route.ts");
  const detail = read("app/lib/secretary-schedule.ts");

  assert.match(migration, /ADD `ponto_encontro` text DEFAULT '' NOT NULL/);
  assert.match(migration, /ADD `horario_encontro` text DEFAULT '' NOT NULL/);
  assert.match(schema, /pontoEncontro: text\("ponto_encontro"\)\.notNull\(\)\.default\(""\)/);
  assert.match(validation, /pontoEncontro: cleanText\(source\.pontoEncontro, 180\)/);
  assert.match(validation, /horarioEncontro: cleanText\(source\.horarioEncontro, 10\)/);
  for (const source of [schedules, schedule]) {
    assert.match(source, /ponto_encontro, horario_encontro/);
  }
  assert.match(detail, /se\.funcao, se\.ponto_encontro, se\.horario_encontro/);
});

test("a liderança vê prontidão da equipe e recebe um único lembrete perto do culto", () => {
  const workspace = read("app/components/SecretaryMinisterialWorkspace.tsx");
  const styles = read("app/secretary.css");
  const schedules = read("app/api/pilot/escalas/route.ts");

  assert.match(workspace, /function teamReadiness\(assignments: Assignment\[\]\)/);
  assert.match(workspace, /"Precisa de substituto"/);
  assert.match(workspace, /"Equipe confirmada"/);
  assert.match(workspace, /className="secretary-team-readiness"/);
  assert.match(styles, /\.secretary-team-readiness\[data-tone="success"\]/);
  assert.match(schedules, /notifyUpcomingPendingConfirmations/);
  assert.match(schedules, /schedule_pending_reminder:\$\{communityId\}:\$\{schedule\.id\}/);
  assert.match(schedules, /datetime\('now', '\+18 hours'\)/);
  assert.match(schedules, /INSERT OR IGNORE INTO configuracoes/);
});

test("modo leitura explica o ponto e o horário de encontro de cada equipe", () => {
  for (const source of [read("app/escala/[token]/page.tsx"), read("app/acesso/[token]/page.tsx")]) {
    assert.match(source, /function teamMeetingDetail/);
    assert.match(source, /ponto_encontro/);
    assert.match(source, /horario_encontro/);
    assert.match(source, /encontro às/);
  }
});
