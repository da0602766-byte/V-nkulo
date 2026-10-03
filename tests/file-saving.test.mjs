import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";
import ts from "typescript";

async function load(path, dependencies = {}, globals = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, URL, Headers, Response, Request, Blob, File, FormData, Uint8Array, crypto: webcrypto, fetch, setTimeout,
      require: key => { if (!(key in dependencies)) throw new Error(`Unexpected import: ${key}`); return dependencies[key]; }, ...globals });
  return exports;
}
const helpers = await load("app/lib/file-copy.ts");
async function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(await readFile(new URL("../drizzle/0084_user_file_copies.sql", import.meta.url), "utf8"));
  const db = { prepare: sql => ({ bind: (...args) => ({ first: async () => sqlite.prepare(sql).get(...args) || null, run: async () => sqlite.prepare(sql).run(...args), all: async () => ({ results: sqlite.prepare(sql).all(...args) }) }) }) };
  const files = new Map(); let sequence = 0, uploads = 0, interrupt = false;
  const fakeFetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/generateIds")) return Response.json({ ids: [`drive-${++sequence}`] });
    if (url.searchParams.get("uploadType") === "resumable") {
      const { id, name } = JSON.parse(options.body);
      if (files.has(id)) return new Response(null, { status: 409 });
      return new Response(null, { headers: { location: `https://www.googleapis.com/upload-session/${id}?name=${encodeURIComponent(name)}` } });
    }
    const id = url.pathname.split("/").at(-1);
    if (options.method === "PUT") {
      uploads++; files.set(id, { blob: options.body, hash: await helpers.contentHash(options.body), name: url.searchParams.get("name") });
      if (interrupt) { interrupt = false; throw new Error("Network interrupted after upload"); }
      return Response.json({ id });
    }
    const file = files.get(id);
    if (!file) return new Response(null, { status: 404 });
    if (url.searchParams.get("alt") === "media") return new Response(file.blob);
    return Response.json({ id, size: String(file.blob.size), sha256Checksum: file.hash, trashed: file.trashed || false });
  };
  const { copyFileToDrive } = await load("app/lib/drive-file-copy.ts", { "../../db": { getD1: () => db }, "./file-copy": helpers }, { fetch: fakeFetch });
  return { copyFileToDrive, files, sqlite, db, get uploads() { return uploads; }, interrupt: () => { interrupt = true; } };
}

test("copies reuse the same reserved Drive ID for repeat and simultaneous saves", async () => {
  const f = await fixture(); const file = new File(["photo content"], "foto.png", { type: "image/png" });
  const copies = await Promise.all(Array.from({ length: 4 }, () => f.copyFileToDrive(1, "a@example.test", "token", file)));
  assert.equal(new Set(copies.map(copy => copy.id)).size, 1);
  assert.equal(f.files.size, 1);
  const uploads = f.uploads;
  const repeat = await f.copyFileToDrive(1, "a@example.test", "token", file);
  assert.equal(repeat.alreadySaved, true); assert.equal(f.uploads, uploads);
});
test("retry after a response is lost verifies the existing file without uploading another copy", async () => {
  const f = await fixture(); const file = new File(["bytes"], "relatorio.pdf"); f.interrupt();
  await assert.rejects(f.copyFileToDrive(1, "a", "token", file));
  assert.equal(f.sqlite.prepare("SELECT status FROM user_file_copies").get().status, "PENDING");
  await f.copyFileToDrive(1, "a", "token", file);
  assert.equal(f.uploads, 1); assert.equal(f.sqlite.prepare("SELECT status FROM user_file_copies").get().status, "READY");
});
test("users, Google accounts, and changed file contents are isolated", async () => {
  const f = await fixture(); const file = new File(["one"], "same.pdf");
  await f.copyFileToDrive(1, "a", "token", file);
  await f.copyFileToDrive(2, "a", "token", file);
  await f.copyFileToDrive(1, "b", "token", file);
  await f.copyFileToDrive(1, "a", "token", new File(["two"], "same.pdf"));
  assert.equal(f.files.size, 4);
});
test("an externally edited or trashed copy is preserved and never overwritten", async () => {
  const f = await fixture(); const file = new File(["original"], "same.pdf");
  const copy = await f.copyFileToDrive(1, "a", "token", file);
  const stored = f.files.get(copy.id); stored.hash = "edited";
  await assert.rejects(f.copyFileToDrive(1, "a", "token", file), /editada/);
  stored.trashed = true;
  await assert.rejects(f.copyFileToDrive(1, "a", "token", file), /lixeira/);
  assert.equal(f.uploads, 1);
});
test("a permanently deleted copy gets one replacement even with simultaneous retries", async () => {
  const f = await fixture(); const file = new File(["original"], "same.pdf");
  const copy = await f.copyFileToDrive(1, "a", "token", file); f.files.delete(copy.id);
  const replacements = await Promise.all([f.copyFileToDrive(1, "a", "token", file), f.copyFileToDrive(1, "a", "token", file)]);
  assert.equal(replacements[0].id, replacements[1].id); assert.notEqual(replacements[0].id, copy.id); assert.equal(f.files.size, 1);
});
test("local and server file downloads do not consult Google, reject login pages, and keep file extensions", async () => {
  let googleCalls = 0;
  const files = await load("app/lib/device-files.ts", { "./file-copy": helpers, "./local-media": { readLocalMedia: async () => ({ blob: new Blob(["offline"]), name: "foto.png", type: "image/png" }) } }, {
    window: { location: { origin: "https://app.test" } }, fetch: async url => {
      if (String(url).includes("google")) googleCalls++;
      return String(url).includes("login") ? new Response("login", { headers: { "Content-Type": "text/html" } }) : new Response("photo", { headers: { "Content-Type": "image/jpeg" } });
    },
  });
  const local = await files.prepareDeviceFile("/local-media/id"); assert.equal(await local.text(), "offline");
  const photo = await files.prepareDeviceFile("/api/pilot/uploads/photo", "foto"); assert.equal(photo.name, "foto.jpg");
  await assert.rejects(files.prepareDeviceFile("/login"), /página/); assert.equal(googleCalls, 0);
});
test("copy download endpoint denies anonymous users and another user's file", async () => {
  const f = await fixture(); let user = null;
  const route = await load("app/api/storage/copies/route.ts", {
    "../../../../db": { getD1: () => f.db }, "../../../lib/local-auth": { getSessionUser: async () => user },
    "../../../lib/google-integration": { getGoogleConnection: async () => ({ drive_enabled: 1, google_email: "a" }), getDriveAccessToken: async () => "token", DriveReconnectRequired: class extends Error {}, readDriveFile: () => { throw new Error("must not read another user's file"); } },
    "../../../lib/drive-file-copy": { copyFileToDrive: f.copyFileToDrive }, "../../../lib/file-copy": helpers,
  });
  const request = new Request("https://app.test/api/storage/copies?file=private");
  assert.equal((await route.GET(request)).status, 401); assert.equal((await route.POST(request)).status, 401);
  const copy = await f.copyFileToDrive(1, "a", "token", new File(["private"], "private.txt"));
  user = { id: 2, ativo: 1 };
  assert.equal((await route.GET(new Request(`https://app.test/api/storage/copies?file=${copy.hash}`))).status, 404);
  assert.equal((await route.POST(new Request("https://app.test/api/storage/copies", { method: "POST", headers: { origin: "https://other.test" } }))).status, 403);
});
