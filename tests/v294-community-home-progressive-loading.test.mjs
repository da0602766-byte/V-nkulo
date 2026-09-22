import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mural encerra Atualizando pela resposta do feed, sem esperar agenda ou escalas", async () => {
  const source = await read("app/components/CommunityHome.tsx");
  assert.match(source, /const feedTask = \(async \(\) => \{/);
  assert.match(source, /const eventsTask = readOnlyFeed/);
  assert.match(source, /const schedulesTask = !readOnlyFeed && canViewSchedules/);
  assert.match(source, /finally \{\s*setLoading\(false\);\s*\}/);
  assert.match(source, /await Promise\.all\(\[feedTask, eventsTask, schedulesTask\]\)/);
  assert.doesNotMatch(source, /const \[feedResponse, eventResponse, scheduleResponse\]/);
});

test("feed inicial continua disponível antes da atualização no navegador", async () => {
  const source = await read("app/components/CommunityHome.tsx");
  assert.match(source, /const \[posts, setPosts\] = useState<FeedItem\[]>\(initialFeed\)/);
  assert.match(source, /loading && !posts\.length/);
});
