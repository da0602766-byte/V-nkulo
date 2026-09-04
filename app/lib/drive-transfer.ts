import { readDriveFile, uploadDriveFile } from "./google-integration";

export async function digestBytes(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)),
    (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Upload once, read back and compare bytes before a caller may change references. */
export async function uploadVerifiedDriveFile(
  accessToken: string, file: Parameters<typeof uploadDriveFile>[1],
) {
  const stored = await uploadDriveFile(accessToken, file);
  const response = await readDriveFile(accessToken, stored.id);
  const copy = new Uint8Array(await response.arrayBuffer());
  const checksum = await digestBytes(file.bytes);
  if (copy.byteLength !== file.bytes.byteLength || await digestBytes(copy) !== checksum) {
    throw new Error("A cópia no Drive não passou na verificação. O original foi preservado.");
  }
  return { ...stored, checksum };
}
