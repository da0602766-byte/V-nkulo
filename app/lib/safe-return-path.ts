const RESERVED_PATHS = new Set([
  "/callback",
  "/login",
  "/signin-with-chatgpt",
  "/signout-with-chatgpt",
]);

export function safeRelativeReturnPath(value: unknown, fallback = "/") {
  const candidate = String(value || "").trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }
  try {
    const url = new URL(candidate, "https://app.local");
    if (
      url.origin !== "https://app.local" ||
      RESERVED_PATHS.has(url.pathname) ||
      url.pathname.startsWith("/api/")
    ) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
