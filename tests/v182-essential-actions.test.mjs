import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mural keeps a compact create-publication action beside its heading", async () => {
  const home = await read("app/components/CommunityHome.tsx");
  const styles = await read("app/globals.css");
  assert.match(home, /community-feed-heading-actions/);
  assert.match(home, /className="community-feed-create"[\s\S]{0,300}Criar publicação/);
  assert.match(styles, /\.community-feed-create\s*\{[^}]*min-height:\s*38px/s);
  assert.match(styles, /\.community-feed-create\s*\{[^}]*white-space:\s*nowrap/s);
});

test("requests start with a guided shortcut that opens the existing form", async () => {
  const requests = await read("app/components/RequestsWorkspace.tsx");
  assert.ok(requests.indexOf("request-start-guide") < requests.indexOf("request-dashboard"));
  assert.match(requests, /formRef\.current\.open = true/);
  assert.match(requests, /Comece por aqui/);
});

test("protected removal explains blockers and owner removal releases commitments", async () => {
  const people = await read("app/components/PeopleWorkspace.tsx");
  const api = await read("app/api/pilot/pessoas/route.ts");
  assert.match(people, /people-removal-guidance/);
  assert.match(people, /Ir para o local/);
  assert.match(api, /buildRemovalBlockers/);
  assert.match(api, /Participante liberado da escala/);
  assert.match(api, /Integrante removido do ministério/);
  assert.match(api, /Funções e escalas foram liberadas/);
});
