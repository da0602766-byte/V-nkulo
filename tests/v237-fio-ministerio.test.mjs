import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("app/components/SecretaryMinisterialWorkspace.tsx", "utf8");
const styles = readFileSync("app/secretary.css", "utf8");
const validation = readFileSync("app/lib/ministry-validation.ts", "utf8");
const schema = readFileSync("db/schema.ts", "utf8");
const migration = readFileSync("drizzle/0072_fio_ministerio.sql", "utf8");
const ministriesRoute = readFileSync("app/api/pilot/ministerios/route.ts", "utf8");
const ministryRoute = readFileSync("app/api/pilot/ministerios/[id]/route.ts", "utf8");
const schedulesRoute = readFileSync("app/api/pilot/escalas/route.ts", "utf8");
const scheduleRoute = readFileSync("app/api/pilot/escalas/[id]/route.ts", "utf8");

test("o Fio é uma opção do ministério e as etapas vivem na escala", () => {
  assert.match(migration, /ALTER TABLE `ministerios_comunidade` ADD `fio_habilitado` integer DEFAULT 0 NOT NULL/);
  assert.match(migration, /ALTER TABLE `ministerios_comunidade` ADD `fio_etapas` text DEFAULT '\[\]' NOT NULL/);
  assert.match(migration, /ALTER TABLE `escalas_ministerio` ADD `fio_etapas` text DEFAULT '\[\]' NOT NULL/);
  assert.match(schema, /fioHabilitado: integer\("fio_habilitado", \{ mode: "boolean" \}\)/);
  assert.match(schema, /fioEtapas: text\("fio_etapas"\)/);
});

test("o ministério guarda só o modelo e cada escala nasce com uma cópia própria", () => {
  assert.match(validation, /export function parseFioTemplate\(/);
  assert.match(validation, /export function parseFioSteps\(/);
  assert.match(validation, /export function seedFioSteps\(template: string\[\]\): FioStep\[\]/);
  assert.match(validation, /FIO_MAX_STEPS = 12/);
  assert.match(ministriesRoute, /fio_habilitado, fio_etapas/);
  assert.match(ministryRoute, /fio_habilitado = \?, fio_etapas = \?/);
  // Sem etapas no formulário, a escala herda o modelo do ministério; com
  // etapas, ela varia por conta própria.
  assert.match(schedulesRoute, /let fioEtapas = parsed\.fioEtapas;\s*\n\s*if \(!fioEtapas\.length\) \{/);
  assert.match(schedulesRoute, /fioEtapas = seedFioSteps\(template\)/);
});

test("marcar etapa é de quem opera, redefinir etapas é de quem gerencia", () => {
  assert.match(scheduleRoute, /if \(action === "FIO_ETAPA"\) \{/);
  assert.match(scheduleRoute, /action !== "FIO_ETAPA"/);
  assert.match(scheduleRoute, /if \(action === "FIO_ETAPAS_DEFINIR"\) \{/);
  assert.match(scheduleRoute, /FIO_MINISTERIO_ETAPA_ATUALIZADA/);
  assert.match(scheduleRoute, /FIO_MINISTERIO_ETAPAS_DEFINIDAS/);
});

test("o Fio explica por que uma etapa não pode ser alterada", () => {
  assert.match(workspace, /canToggleSteps/);
  assert.match(workspace, /fio-access-note/);
  assert.match(workspace, /fio-action-error/);
  assert.match(workspace, /Somente a liderança ou quem está escalado pode alterar esta etapa/);
  assert.match(styles, /\.fio-access-note,\.fio-action-error/);
});

test("o fio responde de um olhar se está tudo pronto para o dia", () => {
  assert.match(workspace, /function fioNodes\(schedule: Schedule, agora: number\): FioNode\[\]/);
  assert.match(workspace, /function fioVerdict\(schedule: Schedule, agora: number\)/);
  assert.match(workspace, /titulo: "Escala criada"/);
  assert.match(workspace, /titulo: "Publicação para a equipe"/);
  assert.match(workspace, /titulo: "Equipe confirmada"/);
  assert.match(workspace, /titulo: "Dia do culto"/);
  assert.match(workspace, /label: "Tudo pronto"/);
  assert.match(workspace, /pendencias === 1 \? "Falta 1 item" : `Faltam \$\{pendencias\} itens`/);
  // A publicação agendada que já existia vira um nó do fio, com contagem.
  assert.match(workspace, /<SchedulePublicationCountdown opensAt=\{schedule\.publicar_em\} \/>/);
});

test("as bolinhas emitem luz, em cascata e sem forçar movimento", () => {
  assert.match(styles, /@keyframes fio-glow/);
  assert.match(styles, /animation:fio-glow 2\.6s ease-in-out infinite backwards/);
  assert.match(styles, /animation-delay:calc\(var\(--i,0\) \* \.16s\)/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)[\s\S]*?\.fio-node::before\{animation:none!important\}/);
  assert.match(workspace, /style=\{\{ "--i": index \} as CSSProperties\}/);
});

test("escalas encerradas recolhem sozinhas e cabem no celular", () => {
  assert.match(workspace, /const escalasSeparadas = useMemo\(\(\) => \{/);
  assert.match(workspace, /\["ENCERRADA", "CANCELADA", "ARQUIVADA"\]\.includes\(schedule\.status\)/);
  assert.match(workspace, /escalasSeparadas\.proximas\.map\(\(schedule\) => renderScheduleCard\(schedule\)\)/);
  assert.match(workspace, /className="fio-encerrada-linha"/);
  assert.match(workspace, /escalasExpandidas\.length \? "Recolher tudo" : "Expandir tudo"/);
  assert.match(
    styles,
    /@media\(max-width:640px\)\{[\s\S]*?\.fio-encerrada-linha\{[\s\S]*?grid-template-areas:"data titulo" "selo selo"/,
  );
});

test("o Fio só aparece onde o ministério ligou a opção", () => {
  assert.match(workspace, /const ministeriosComFio = useMemo\(/);
  assert.match(workspace, /ministeriosComFio\.has\(schedule\.ministerio_id\) && Boolean\(schedule\.can_manage\)/);
  assert.match(workspace, /<FioTemplateFields categoria=\{categoria\} value=\{fio\} onChange=\{setFio\} \/>/);
  assert.match(workspace, /fioHabilitado: fio\.habilitado/);
  assert.match(workspace, /fioEtapas: fio\.habilitado \? fio\.etapas : \[\]/);
});
