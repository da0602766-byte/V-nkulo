export type VapidConfiguration = {
  publicKey: string;
  privateKey: JsonWebKey;
  subject: string;
};

type SubscriptionKeys = {
  p256dh: string;
  auth: string;
};

const PUSH_RECORD_SIZE = 4096;
const MAX_PUSH_PAYLOAD_BYTES = 3900;
const textEncoder = new TextEncoder();

export async function encryptWebPushPayload(payload: string, subscription: SubscriptionKeys) {
  const receiverPublicKey = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);
  const plaintext = concatenate(textEncoder.encode(payload), new Uint8Array([2]));
  if (
    receiverPublicKey.length !== 65 ||
    receiverPublicKey[0] !== 4 ||
    authSecret.length < 16 ||
    authSecret.length > 64 ||
    plaintext.length > MAX_PUSH_PAYLOAD_BYTES
  ) {
    throw new Error("Assinatura de push inválida.");
  }

  const receiverKey = await crypto.subtle.importKey(
    "raw",
    receiverPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const senderKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const senderPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", senderKeys.publicKey));
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: receiverKey }, senderKeys.privateKey, 256),
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const inputKeyMaterial = await hkdf(
    authSecret,
    sharedSecret,
    concatenate(textEncoder.encode("WebPush: info"), new Uint8Array([0]), receiverPublicKey, senderPublicKey),
    32,
  );
  const contentEncryptionKey = await hkdf(
    salt,
    inputKeyMaterial,
    textEncoder.encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(
    salt,
    inputKeyMaterial,
    textEncoder.encode("Content-Encoding: nonce\0"),
    12,
  );
  const key = await crypto.subtle.importKey("raw", contentEncryptionKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintext),
  );
  return concatenate(salt, uint32(PUSH_RECORD_SIZE), new Uint8Array([senderPublicKey.length]), senderPublicKey, encrypted);
}

export async function createVapidAuthorization(endpoint: string, configuration: VapidConfiguration) {
  const header = base64UrlEncode(textEncoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(
    textEncoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: configuration.subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    configuration.privateKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, textEncoder.encode(unsigned)),
  );
  return `vapid t=${unsigned}.${base64UrlEncode(signature)}, k=${configuration.publicKey}`;
}

async function hkdf(salt: Uint8Array, input: Uint8Array, info: Uint8Array, length: number) {
  const pseudorandomKey = await hmac(salt, input);
  const output: Uint8Array[] = [];
  let previous = new Uint8Array();
  let counter = 1;
  while (concatenate(...output).length < length) {
    previous = await hmac(pseudorandomKey, concatenate(previous, info, new Uint8Array([counter])));
    output.push(previous);
    counter += 1;
  }
  return concatenate(...output).slice(0, length);
}

async function hmac(keyData: Uint8Array, value: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(keyData), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, toArrayBuffer(value)));
}

function uint32(value: number) {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

function concatenate(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function base64UrlDecode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Base64url inválido.");
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlEncode(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toArrayBuffer(value: Uint8Array) {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}
