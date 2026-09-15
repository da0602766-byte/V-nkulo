import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  CLASSES,
  agrupar,
  classeDoStatus,
  janelaDaHora,
  normalizarRota,
  resumir,
} from "../app/lib/request-metrics-policy.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("a janela agrega por hora UTC", () => {
  assert.equal(janelaDaHora(Date.UTC(2026, 8, 14, 13, 47, 3)), "2026-09-14T13");
  assert.equal(janelaDaHora(Date.UTC(2026, 8, 14, 13, 0, 0)), "2026-09-14T13");
  // A virada de hora precisa cair em janela nova.
  assert.equal(janelaDaHora(Date.UTC(2026, 8, 14, 14, 0, 0)), "2026-09-14T14");
});

test("a classe cobre toda a faixa de status", () => {
  assert.equal(classeDoStatus(200), "2xx");
  assert.equal(classeDoStatus(201), "2xx");
  assert.equal(classeDoStatus(303), "3xx");
  assert.equal(classeDoStatus(401), "4xx");
  assert.equal(classeDoStatus(429), "4xx");
  assert.equal(classeDoStatus(500), "5xx");
  assert.equal(classeDoStatus(503), "5xx");
  assert.deepEqual(CLASSES, ["2xx", "3xx", "4xx", "5xx"]);
});

test("a rota é normalizada para não virar rastro de navegação", () => {
  // Sem isto, cada registro aberto viraria uma linha própria — a tabela
  // registraria quem abriu o quê, que é o que este projeto não guarda.
  assert.equal(normalizarRota("/api/pilot/eventos/41"), "/api/pilot/eventos/:id");
  assert.equal(normalizarRota("/api/pilot/eventos/42"), "/api/pilot/eventos/:id");
  assert.equal(
    normalizarRota("/api/pilot/escalas/7/acessos/12"),
    "/api/pilot/escalas/:id/acessos/:id",
  );
  assert.equal(
    normalizarRota("/api/public/cadastro-membro/3f2a9c1d-1111-4222-8333-444455556666"),
    "/api/public/cadastro-membro/:id",
  );
  // Token longo também é identificador.
  assert.equal(
    normalizarRota("/api/acesso-temporario/QWERTYUIOPASDFGHJKLZXCVBNM123456"),
    "/api/acesso-temporario/:id",
  );
  // Nome de rota de verdade continua legível.
  assert.equal(normalizarRota("/api/auth/login"), "/api/auth/login");
  assert.equal(normalizarRota("/api/proprietario/otimizacao"), "/api/proprietario/otimizacao");
  // A query string não entra.
  assert.equal(normalizarRota("/api/pilot/feed?cursor=abc123"), "/api/pilot/feed");
});

test("o agrupamento soma o par rota+classe em uma linha só", () => {
  const eventos = [
    { janela: "2026-09-14T13", rota: "/api/auth/login", classe: "2xx" },
    { janela: "2026-09-14T13", rota: "/api/auth/login", classe: "2xx" },
    { janela: "2026-09-14T13", rota: "/api/auth/login", classe: "4xx" },
    { janela: "2026-09-14T14", rota: "/api/auth/login", classe: "2xx" },
  ];
  const agrupado = agrupar(eventos);
  assert.equal(agrupado.length, 3);
  assert.equal(
    agrupado.find((l) => l.janela === "2026-09-14T13" && l.classe === "2xx").total,
    2,
  );
  assert.equal(agrupar([]).length, 0);
});

test("o resumo calcula taxa de erro e ordena pelas falhas de servidor", () => {
  const resumo = resumir([
    { rota: "/api/pilot/feed", classe: "2xx", total: 900 },
    { rota: "/api/pilot/feed", classe: "4xx", total: 50 },
    { rota: "/api/auth/login", classe: "2xx", total: 40 },
    { rota: "/api/auth/login", classe: "4xx", total: 8 },
    { rota: "/api/pilot/escalas", classe: "5xx", total: 2 },
  ]);

  assert.equal(resumo.total, 1000);
  assert.equal(resumo.porClasse["5xx"], 2);
  assert.equal(resumo.porClasse["4xx"], 58);
  assert.equal(resumo.taxaErro, 6);
  assert.equal(resumo.taxaFalha, 0.2);
  // Quem opera precisa ver primeiro a rota que está quebrando, mesmo com
  // volume pequeno perto das outras.
  assert.equal(resumo.rotas[0].rota, "/api/pilot/escalas");
  assert.equal(resumo.rotas[0].falhas, 2);
});

test("o resumo não divide por zero quando não há tráfego", () => {
  const resumo = resumir([]);
  assert.equal(resumo.total, 0);
  assert.equal(resumo.taxaErro, 0);
  assert.equal(resumo.taxaFalha, 0);
  assert.deepEqual(resumo.rotas, []);
});

test("a migração 0073 cria a tabela com chave única por janela, rota e classe", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec(
    (await source("drizzle/0073_metricas_requisicao.sql"))
      .split("--> statement-breakpoint")
      .join("\n"),
  );
  database
    .prepare(
      "INSERT INTO metricas_requisicao (janela, rota, classe, total) VALUES ('2026-09-14T13','/api/auth/login','2xx',3)",
    )
    .run();
  assert.throws(
    () =>
      database
        .prepare(
          "INSERT INTO metricas_requisicao (janela, rota, classe, total) VALUES ('2026-09-14T13','/api/auth/login','2xx',1)",
        )
        .run(),
    /UNIQUE/i,
  );
  // O acumulado usa ON CONFLICT em cima dessa chave.
  database
    .prepare(
      `INSERT INTO metricas_requisicao (janela, rota, classe, total)
       VALUES ('2026-09-14T13','/api/auth/login','2xx',4)
       ON CONFLICT(janela, rota, classe) DO UPDATE SET
         total = metricas_requisicao.total + excluded.total`,
    )
    .run();
  assert.equal(
    database.prepare("SELECT total FROM metricas_requisicao LIMIT 1").get().total,
    7,
  );
});

test("a medição conta só API, guarda contagem e nunca conteúdo", async () => {
  const metricas = await source("app/lib/request-metrics.ts");
  // Página e asset ficam de fora.
  assert.match(metricas, /if \(!caminho\.startsWith\("\/api\/"\)\) return;/);
  // Nada de usuário, corpo ou query na escrita.
  assert.doesNotMatch(metricas, /usuario_id|usuarioId|request\.headers|searchParams/);
  // A descarga é em lote e não pode derrubar a requisição.
  assert.match(metricas, /LIMITE_BUFFER/);
  assert.match(metricas, /catch \{/);

  const worker = await source("worker/index.ts");
  assert.match(worker, /contabilizar\(env, ctx, url\.pathname, response\.status\)/);
  // O 500 é justamente o que o painel precisa enxergar.
  assert.match(worker, /contabilizar\(env, ctx, url\.pathname, 500\)/);
  assert.match(worker, /ctx\.waitUntil\(\s*descarregarMetricas/);
});

test("o painel de saúde é exclusivo do proprietário", async () => {
  const rota = await source("app/api/proprietario/saude/route.ts");
  assert.match(rota, /requireOwner\(\)/);
  assert.match(rota, /if \("error" in access\) return access\.error;/);

  // A checagem de dono virou módulo em vez de ser copiada: duplicar regra de
  // autorização é como ela diverge entre dois endpoints.
  const acesso = await source("app/lib/owner-access.ts");
  assert.match(acesso, /user\.ativo/);
  assert.match(acesso, /user\.system_owner/);
  assert.match(acesso, /status: 403/);
  const painel = await source("app/api/proprietario/route.ts");
  assert.match(painel, /import \{ requireOwner \} from "\.\.\/\.\.\/lib\/owner-access"/);
  assert.doesNotMatch(painel, /async function requireOwner/);
});
