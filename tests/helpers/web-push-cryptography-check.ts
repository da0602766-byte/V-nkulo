import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
// @ts-expect-error This helper is executed by Node's TypeScript stripping mode.
import { createVapidAuthorization, encryptWebPushPayload, type VapidConfiguration } from "../../app/lib/web-push-crypto.ts";

if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

const encoder = new TextEncoder();

const receiverKeys = await crypto.subtle.generateKey(
  { name: "ECDH", namedCurve: "P-256" },
  true,
  ["deriveBits"],
);
const receiverPublic = new Uint8Array(await crypto.subtle.exportKey("raw", receiverKeys.publicKey));
const auth = crypto.getRandomValues(new Uint8Array(16));
const body = await encryptWebPushPayload("aviso criptografado", {
  p256dh: base64UrlEncode(receiverPublic),
  auth: base64UrlEncode(auth),
});

assert.equal(body[16], 0);
assert.equal(body[17], 0);
assert.equal(body[18], 16);
assert.equal(body[19], 0);
assert.equal(body[20], 65);
assert.deepEqual(
  new TextDecoder().decode(await decryptBody(body, receiverKeys.privateKey, receiverPublic, auth)),
  "aviso criptografado\u0002",
);

const vapidKeys = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const privateJwk = await crypto.subtle.exportKey("jwk", vapidKeys.privateKey);
const vapidPublic = new Uint8Array(await crypto.subtle.exportKey("raw", vapidKeys.publicKey));
const configuration: VapidConfiguration = {
  publicKey: base64UrlEncode(vapidPublic),
  privateKey: privateJwk,
  subject: "https://vinkulo.example.test",
};
const authorization = await createVapidAuthorization(
  "https://fcm.googleapis.com/fcm/send/example",
  configuration,
);
const [tokenPart, keyPart] = authorization.replace(/^vapid t=/, "").split(", k=");
assert.equal(keyPart, configuration.publicKey);
const [header, claims, signature] = tokenPart.split(".");
const publicJwk = await crypto.subtle.exportKey("jwk", vapidKeys.publicKey);
const verified = await crypto.subtle.verify(
  { name: "ECDSA", hash: "SHA-256" },
  await crypto.subtle.importKey("jwk", publicJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]),
  base64UrlDecode(signature),
  encoder.encode(`${header}.${claims}`),
);
assert.equal(verified, true);
assert.equal(JSON.parse(new TextDecoder().decode(base64UrlDecode(claims))).aud, "https://fcm.googleapis.com");

async function decryptBody(
  body: Uint8Array,
  privateKey: CryptoKey,
  receiverPublicKey: Uint8Array,
  authSecret: Uint8Array,
) {
  const salt = body.slice(0, 16);
  const senderPublicKey = body.slice(21, 86);
  const ciphertext = body.slice(86);
  const senderKey = await crypto.subtle.importKey(
    "raw",
    senderPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: senderKey }, privateKey, 256),
  );
  const inputKeyMaterial = await hkdf(
    authSecret,
    sharedSecret,
    combine(encoder.encode("WebPush: info"), new Uint8Array([0]), receiverPublicKey, senderPublicKey),
    32,
  );
  const contentEncryptionKey = await hkdf(salt, inputKeyMaterial, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, inputKeyMaterial, encoder.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", contentEncryptionKey, { name: "AES-GCM" }, false, ["decrypt"]);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext);
}

async function hkdf(salt: Uint8Array, input: Uint8Array, info: Uint8Array, length: number) {
  const pseudorandomKey = await hmac(salt, input);
  let previous = new Uint8Array();
  const output: Uint8Array[] = [];
  let counter = 1;
  while (combine(...output).length < length) {
    previous = await hmac(pseudorandomKey, combine(previous, info, new Uint8Array([counter])));
    output.push(previous);
    counter += 1;
  }
  return combine(...output).slice(0, length);
}

async function hmac(keyData: Uint8Array, value: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(keyData), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, toArrayBuffer(value)));
}

function combine(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function base64UrlEncode(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(value: Uint8Array) {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}
