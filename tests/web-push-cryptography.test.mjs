import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("a criptografia Web Push e a assinatura VAPID passam por cifra e verificação reais", async () => {
  await execFileAsync(
    process.execPath,
    ["--experimental-strip-types", "tests/helpers/web-push-cryptography-check.ts"],
    { cwd: process.cwd(), windowsHide: true },
  );
  assert.ok(true);
});
