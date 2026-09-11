import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("temporary access uses the Android share sheet instead of whatsapp protocol redirects", async () => {
  const secretary = await read("app/components/SecretaryMinisterialWorkspace.tsx");
  const posts = await read("app/components/CommunityPostShare.tsx");
  assert.match(secretary, /navigator\.share\(\{/);
  assert.match(secretary, />Escolher conversa ou grupo<\/button>/);
  assert.doesNotMatch(secretary, /https:\/\/wa\.me\/\?text=/);
  assert.match(posts, /WhatsApp<\/button>/);
  assert.doesNotMatch(posts, /open\(`https:\/\/wa\.me\/\?text=/);
});

test("custom release dates remain controlled and are validated without reverting", async () => {
  const [secretary, accessApi] = await Promise.all([
    read("app/components/SecretaryMinisterialWorkspace.tsx"),
    read("app/api/pilot/escalas/[id]/acessos/route.ts"),
  ]);
  assert.match(secretary, /temporaryAccessWindowError\(startsAt, endsAt\)/);
  assert.match(secretary, /Escolha livremente o início e o término/);
  assert.doesNotMatch(secretary, /value=\{startsAt\} min=\{toLocalDateTimeInput/);
  assert.doesNotMatch(secretary, /value=\{endsAt\} min=\{toLocalDateTimeInput/);
  assert.match(accessApi, /endsAt <= Date\.now\(\)/);
  assert.doesNotMatch(accessApi, /startsAt < scheduleStartsAt/);
  assert.doesNotMatch(accessApi, /endsAt > scheduleEndsAt/);
});

test("changing dates or resource invalidates the previously generated message", async () => {
  const secretary = await read("app/components/SecretaryMinisterialWorkspace.tsx");
  assert.match(secretary, /function resetGeneratedAccess\(\)/);
  assert.match(secretary, /setCreated\(\[\]\);\s*setMessage\(""\);/);
  assert.match(secretary, /setStartsAt\(event\.target\.value\); resetGeneratedAccess\(\);/);
  assert.match(secretary, /setEndsAt\(event\.target\.value\); resetGeneratedAccess\(\);/);
});
