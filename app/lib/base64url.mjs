// Base64url (RFC 4648 §5) — sem preenchimento, seguro em URL e em JSON.
//
// Estava duplicado dentro de google-integration.ts como função privada. Virou
// módulo próprio quando o MFA passou a precisar do mesmo par para guardar o
// segredo cifrado: uma terceira cópia seria a hora de parar.

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

/**
 * @param {string} value
 * @returns {Uint8Array<ArrayBuffer>}
 */
export function fromBase64Url(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
