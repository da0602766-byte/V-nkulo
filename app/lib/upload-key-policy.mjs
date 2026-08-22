export const UPLOAD_PURPOSES = new Set([
  "community-logo",
  "community-banner",
  "ministry-banner",
  "login-logo",
  "login-background",
  "visual-editor-image",
  "post-image",
  "profile-photo",
  "platform-logo",
  "platform-feed-banner",
]);

const FILE_NAME = /^[0-9a-f-]+\.(jpg|png|webp)$/i;

export function getUploadOwnerSegment(
  purpose,
  { userId, ministryId, communityId },
) {
  if (purpose === "profile-photo") return `user-${userId}`;
  if (purpose === "ministry-banner") return `ministry-${ministryId}`;
  return String(communityId);
}

export function isSafeUploadKey(key) {
  const parts = String(key || "").split("/");
  if (parts.length !== 4 || parts[0] !== "images") return false;
  const [, purpose, owner, fileName] = parts;
  if (!UPLOAD_PURPOSES.has(purpose) || !FILE_NAME.test(fileName)) return false;
  if (purpose === "profile-photo") return /^user-\d+$/.test(owner);
  if (purpose === "ministry-banner") return /^ministry-\d+$/.test(owner);
  return /^\d+$/.test(owner);
}
