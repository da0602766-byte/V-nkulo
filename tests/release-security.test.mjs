import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("gate final V4.5 não contém segredos e mantém proteções críticas", async () => {
  const productionFiles = await collectFiles(
    ["app", "worker", "db"],
    /\.(?:ts|tsx|mjs|js|json)$/,
  );
  const contents = await Promise.all(
    productionFiles.map(async (file) => ({
      file,
      content: await readFile(new URL(`../${file}`, import.meta.url), "utf8"),
    })),
  );
  const combined = contents.map((item) => item.content).join("\n");

  const forbiddenSecretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /NEXT_PUBLIC_(?:AUTH_SECRET|DATABASE_URL|API_SECRET)/,
  ];
  for (const pattern of forbiddenSecretPatterns) {
    assert.doesNotMatch(combined, pattern);
  }

  const worker = await readFile(
    new URL("../worker/index.ts", import.meta.url),
    "utf8",
  );
  const auth = await readFile(
    new URL("../app/lib/local-auth.ts", import.meta.url),
    "utf8",
  );
  const pilot = await readFile(
    new URL("../app/lib/pilot-config.ts", import.meta.url),
    "utf8",
  );

  assert.match(worker, /validateApiRequest/);
  assert.match(worker, /sec-fetch-site/);
  assert.match(worker, /MAX_API_BODY_BYTES/);
  assert.match(worker, /frame-ancestors 'none'/);
  assert.match(worker, /X-Permitted-Cross-Domain-Policies/);
  assert.match(auth, /__Host-adote_session/);
  assert.match(auth, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(auth, /replacePasswordWithToken/);
  const reset = await readFile(new URL("../app/lib/password-reset.mjs", import.meta.url), "utf8");
  assert.match(reset, /DELETE FROM sessoes/);
  assert.match(pilot, /networkModuleEnabled:\s*false/);
  assert.match(pilot, /paymentsEnabled:\s*false/);
  assert.match(pilot, /aiAutoPublishEnabled:\s*false/);
  assert.match(pilot, /aiEditorialMode:\s*"COM_REVISAO"/);
});

async function collectFiles(
  roots,
  allowedExtension,
) {
  const files = [];
  for (const root of roots) {
    await walk(root, files, allowedExtension);
  }
  return files;
}

async function walk(directory, files, allowedExtension) {
  const entries = await readdir(
    new URL(`../${directory}/`, import.meta.url),
    { withFileTypes: true },
  );
  for (const entry of entries) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      await walk(relative, files, allowedExtension);
    } else if (allowedExtension.test(entry.name)) {
      files.push(relative);
    }
  }
}
