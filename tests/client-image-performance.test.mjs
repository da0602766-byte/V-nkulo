import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/client-image.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { prepareImageForUpload } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

function imageEnvironment(t, { width = 4000, height = 3000, bytes = 100 * 1024, fail = false } = {}) {
  const frames = [];
  let closed = false;
  t.mock.method(globalThis, "createImageBitmap", async () => ({ width, height, close() { closed = true; } }));
  t.mock.method(globalThis.document, "createElement", () => {
    const frame = { width: 0, height: 0, qualities: [], alpha: false };
    frames.push(frame);
    return {
      get width() { return frame.width; }, set width(value) { frame.width = value; },
      get height() { return frame.height; }, set height(value) { frame.height = value; },
      getContext(_type, options) { frame.alpha = options.alpha; return { drawImage() {} }; },
      toBlob(callback, type, quality) {
        frame.qualities.push(quality);
        callback(fail ? null : new Blob([new Uint8Array(typeof bytes === "function" ? bytes(frame) : bytes)], { type }));
      },
    };
  });
  return { frames, get closed() { return closed; } };
}

// Only browser capabilities are stubbed. The actual resize/encoding selection,
// bounds, validation, File creation and resource cleanup run unchanged.
globalThis.createImageBitmap ??= async () => { throw new Error("unmocked bitmap"); };
globalThis.document ??= { createElement() { throw new Error("unmocked canvas"); } };
const photo = () => new File([new Uint8Array(1024)], "foto.jpg", { type: "image/jpeg" });

test("new post photos keep aspect ratio within 1920px and 600KiB", async t => {
  const env = imageEnvironment(t, { bytes: frame => frame.qualities.at(-1) > 0.8 ? 800 * 1024 : 500 * 1024 });
  const result = await prepareImageForUpload(photo(), "post-image");
  assert.equal(result.type, "image/webp");
  assert.equal(result.name, "foto.webp");
  assert.ok(result.size <= 600 * 1024);
  assert.deepEqual([env.frames[0].width, env.frames[0].height], [1920, 1440]);
  assert.deepEqual(env.frames[0].qualities, [0.86, 0.8]);
  assert.equal(env.frames[0].alpha, true);
  assert.equal(env.closed, true);
});

test("profile portraits fit 512px; small photos are never upscaled", async t => {
  const portrait = imageEnvironment(t, { width: 3000, height: 4000 });
  const result = await prepareImageForUpload(photo(), "profile-photo");
  assert.ok(result.size <= 160 * 1024);
  assert.deepEqual([portrait.frames[0].width, portrait.frames[0].height], [384, 512]);
  t.mock.restoreAll();
  const small = imageEnvironment(t, { width: 120, height: 80 });
  await prepareImageForUpload(photo(), "post-image");
  assert.deepEqual([small.frames[0].width, small.frames[0].height], [120, 80]);
});

test("wallpapers and evidence retain their high-resolution conversion", async t => {
  const env = imageEnvironment(t, { width: 6000, height: 4000, bytes: 1024 * 1024 });
  await prepareImageForUpload(photo(), "community-banner");
  assert.equal(env.frames[0].width, 4096);
  assert.equal(env.frames[0].qualities[0], 0.96);
  await prepareImageForUpload(photo(), "feedback-evidence");
  assert.equal(env.frames[1].width, 3200);
  assert.equal(env.frames[1].qualities[0], 0.96);
});

test("encoding failures release the bitmap and never upload oversized photos", async t => {
  const env = imageEnvironment(t, { bytes: 700 * 1024 });
  await assert.rejects(prepareImageForUpload(photo(), "post-image"), /Não foi possível otimizar/);
  assert.equal(env.closed, true);
  assert.equal(env.frames.length, 3);
  assert.ok(env.frames.every(frame => frame.width <= 1920));
});

test("empty, oversized and SVG input is rejected before decoding", async t => {
  const env = imageEnvironment(t);
  await assert.rejects(prepareImageForUpload(new File([], "empty.jpg", { type: "image/jpeg" }), "post-image"));
  await assert.rejects(prepareImageForUpload(new File(["<svg/>"], "image.svg", { type: "image/svg+xml" }), "post-image"));
  await assert.rejects(prepareImageForUpload({ type: "image/jpeg", size: 51 * 1024 * 1024 }, "post-image"));
  assert.equal(env.frames.length, 0);
});
