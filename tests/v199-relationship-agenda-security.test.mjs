import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("as cinco migrações de relacionamento e agenda são aditivas e ordenadas", async () => {
  const migrations = await Promise.all([
    source("drizzle/0062_contact_logging.sql"),
    source("drizzle/0063_visita_tracking.sql"),
    source("drizzle/0064_escala_respostas.sql"),
    source("drizzle/0065_indisponibilidade.sql"),
    source("drizzle/0066_metas_objetivos.sql"),
  ]);
  const tables = ["visitor_contacts", "visitor_visits", "escala_respostas", "indisponibilidades", "metas_objetivos"];

  migrations.forEach((sql, index) => {
    assert.match(sql, new RegExp("CREATE TABLE(?: IF NOT EXISTS)? `" + tables[index] + "`"));
    assert.match(sql, /CREATE (?:UNIQUE )?INDEX/);
    assert.doesNotMatch(sql, /DROP TABLE|ALTER TABLE|DELETE FROM/i);
  });
});

test("relacionamento separa leitura e escrita e valida o visitante no tenant", async () => {
  const route = await source("app/api/pilot/relacionamento/route.ts");

  assert.match(route, /export async function GET[\s\S]*requireTenantPermission\("visitors\.view"\)/);
  assert.match(route, /export async function POST[\s\S]*requireTenantPermission\("followups\.manage"\)/);
  assert.match(route, /export async function DELETE[\s\S]*requireTenantPermission\("followups\.manage"\)/);
  assert.match(route, /visitorBelongsToCommunity\(db, comunidadeId, visitanteId\)/);
  assert.match(route, /WHERE id = \? AND comunidade_id = \? AND ativo = 1/);
  assert.match(route, /ultimo_contato IS NULL[\s\S]*'-30 days'[\s\S]*'-7 days'/);
  assert.doesNotMatch(route, /v\.ultimo_contato, v\.proximo_contato/);
  assert.match(route, /FROM acompanhamentos a/);
  assert.match(route, /SELECT MAX\(a\.criado_em\) FROM acompanhamentos a/);
  assert.doesNotMatch(route, /SELECT v\.id, v\.nome_completo, v\.status, v\.ultimo_contato/);
  assert.doesNotMatch(route, /SELECT v\.id, v\.nome_completo, v\.ultimo_contato/);
  assert.doesNotMatch(route, /categorias_acompanhamento/);
  assert.match(route, /LEFT JOIN visitante_categorias c/);
});

test("refinamentos de agenda isolam respostas, indisponibilidade e metas", async () => {
  const route = await source("app/api/pilot/agenda-refinamentos/route.ts");

  assert.match(route, /permissions\.includes\("schedules\.respond"\)/);
  assert.match(route, /WHERE id = \? AND comunidade_id = \? AND usuario_id = \? AND ativo = 1/);
  assert.match(route, /\.bind\(\.\.\.[\s\S]*targetUserId/);
  assert.match(route, /FROM metas_objetivos[\s\S]*WHERE comunidade_id = \? AND usuario_id = \?/);
  assert.match(route, /corpo\.bloqueioPessoal !== false/);
  assert.doesNotMatch(route, /\.bind\(usuarioId \? \[/);
});

test("interface mostra históricos individuais e conecta Fio com Agenda", async () => {
  const [tools, agenda, thread] = await Promise.all([
    source("app/components/RelacionamentoTools.tsx"),
    source("app/components/AgendaCalendar.tsx"),
    source("app/components/DayThreadWorkspace.tsx"),
  ]);

  assert.match(tools, /Pessoa do histórico de relacionamento/);
  assert.match(tools, /ferramenta=contatos&visitanteId=/);
  assert.match(tools, /ferramenta=visitas&visitanteId=/);
  assert.match(tools, /Nenhum contato registrado/);
  assert.match(tools, /Nenhuma visita registrada/);
  assert.match(agenda, /href="\/painel\?view=fio"/);
  assert.match(thread, /href="\/painel\?view=eventos"/);
});

test("arquivos grandes permanecem texto íntegro e com tamanho esperado", async () => {
  const paths = [
    "app/globals.css",
    "app/components/TenantOperations.tsx",
    "app/components/RelacionamentoTools.tsx",
  ];

  for (const path of paths) {
    const url = new URL(`../${path}`, import.meta.url);
    const [buffer, metadata] = await Promise.all([readFile(url), stat(url)]);
    assert.equal(buffer.includes(0), false, `${path} contém byte nulo`);
    assert.ok(metadata.size > 20_000, `${path} está menor do que o esperado`);
  }
});
