export function needsAndroidPolicyUpdate(version?: string) {
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) return true;
  const [major, minor] = version.split(".").map(Number);
  return major < 1 || (major === 1 && minor < 23);
}
