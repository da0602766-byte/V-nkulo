export function needsAndroidPolicyUpdate(version?: string) {
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) return true;
  const [major, minor] = version.split(".").map(Number);
  return major < 1 || (major === 1 && minor < 23);
}

/** Icon-only update: does not revoke the offline policy of older compatible apps. */
export function needsAndroidIconUpdate(version?: string) {
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) return true;
  const [major, minor] = version.split(".").map(Number);
  return major < 1 || (major === 1 && minor < 24);
}

/** Older APKs still open the previous Site origin. */
export function needsAndroidUrlUpdate(version?: string) {
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) return true;
  const [major, minor, patch] = version.split(".").map(Number);
  return major < 1 || (major === 1 && (minor < 24 || (minor === 24 && patch < 1)));
}
