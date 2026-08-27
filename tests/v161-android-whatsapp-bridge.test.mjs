import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("temporary access opens WhatsApp through the Android bridge before web sharing", async () => {
  const secretary = await read("app/components/SecretaryMinisterialWorkspace.tsx");
  const bridgeIndex = secretary.indexOf("shareToWhatsAppApp(safeMessage)");
  const webShareIndex = secretary.indexOf("navigator.share");
  assert.ok(bridgeIndex >= 0, "Android bridge is used");
  assert.ok(webShareIndex > bridgeIndex, "Android bridge has priority over the web share sheet");
  assert.match(secretary, /WhatsApp aberto\. Escolha a conversa ou o grupo\./);
});

test("community WhatsApp button uses the Android bridge with a web fallback", async () => {
  const posts = await read("app/components/CommunityPostShare.tsx");
  assert.match(posts, /async function shareOnWhatsApp\(\)/);
  assert.match(posts, /shareToWhatsAppApp\(shareData\.message\)/);
  assert.match(posts, /await nativeShare\(\)/);
  assert.match(posts, /void shareOnWhatsApp\(\)/);
});

test("the bridge opens WhatsApp directly and falls back to a WhatsApp deep link", async () => {
  const bridge = await read("app/lib/androidNativeBridge.ts");
  assert.match(bridge, /window\.VinkuloAndroid\?\.shareToWhatsApp/);
  assert.match(bridge, /share\(message\);\s*return true;/);
  assert.match(bridge, /intent:\/\/send\?text=/);
  assert.match(bridge, /https:\/\/api\.whatsapp\.com\/send\?text=/);
  assert.doesNotMatch(bridge, /navigator\.clipboard/);
});

test("Android reception offers the signed 1.3.0 APK and hides the prompt inside the native app", async () => {
  const install = await read("app/components/MobileAppInstall.tsx");
  assert.match(install, /Boolean\(window\.VinkuloAndroid\)/);
  assert.match(install, /\/downloads\/VINKULO_ANDROID_1\.3\.0\.apk/);
  assert.match(install, />\s*Baixar APK\s*</);
});
