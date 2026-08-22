/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { runWithRuntimeEnv } from "../db/runtime-env";
import type { R2BucketBinding } from "../db/runtime-env";
import { runPlatformOptimizationIfDue } from "../app/lib/platform-optimizer";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET: R2BucketBinding;
  AUTH_SECRET: string;
  SYSTEM_OWNER_EMAIL?: string;
  SYSTEM_OWNER_LOCKED_BEFORE?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const MAX_API_BODY_BYTES = 1024 * 1024;
const MAX_UPLOAD_BODY_BYTES = 7 * 1024 * 1024;
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const OPTIMIZER_CHECK_INTERVAL_MS = 5 * 60 * 1000;
let nextOptimizerCheckAt = 0;

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const blockedRequest = validateApiRequest(request, url);
    if (blockedRequest) {
      return withSecurityHeaders(blockedRequest, url.pathname);
    }

    try {
      if (url.pathname === "/_vinext/image") {
        const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
        const imageResponse = await handleImageOptimization(request, {
          fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
            return result.response();
          },
        }, allowedWidths);
        return withSecurityHeaders(imageResponse, url.pathname);
      }

      if (
        url.pathname !== "/api/proprietario/otimizacao" &&
        Date.now() >= nextOptimizerCheckAt
      ) {
        nextOptimizerCheckAt = Date.now() + OPTIMIZER_CHECK_INTERVAL_MS;
        ctx.waitUntil(
          runPlatformOptimizationIfDue(env.DB).catch(() => undefined),
        );
      }

      const response = await runWithRuntimeEnv(env, () =>
        handler.fetch(request, env, ctx),
      );
      return withSecurityHeaders(response, url.pathname);
    } catch {
      const fallback = url.pathname.startsWith("/api/")
        ? Response.json(
            { error: "Não foi possível concluir a solicitação." },
            { status: 500 },
          )
        : new Response("Não foi possível carregar esta página.", {
            status: 500,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
      return withSecurityHeaders(fallback, url.pathname);
    }
  },
};

export default worker;

function withSecurityHeaders(response: Response, pathname: string) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'",
  );
  headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  if (
    pathname.startsWith("/convite/") ||
    pathname.startsWith("/escala/") ||
    pathname.startsWith("/redefinir-senha")
  ) {
    headers.set("Referrer-Policy", "no-referrer");
  }
  if (
    pathname.startsWith("/api/") ||
    pathname === "/painel" ||
    pathname === "/login" ||
    pathname.startsWith("/convite/") ||
    pathname.startsWith("/escala/")
  ) {
    headers.set("Cache-Control", "no-store");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function validateApiRequest(request: Request, url: URL) {
  if (!url.pathname.startsWith("/api/") || !UNSAFE_METHODS.has(request.method)) {
    return null;
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    return Response.json(
      { error: "Origem da solicitação não permitida." },
      { status: 403 },
    );
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) {
    return Response.json(
      { error: "Origem da solicitação não permitida." },
      { status: 403 },
    );
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  const maximumBodyBytes =
    url.pathname === "/api/pilot/uploads"
      ? MAX_UPLOAD_BODY_BYTES
      : MAX_API_BODY_BYTES;
  if (
    Number.isFinite(contentLength) &&
    contentLength > maximumBodyBytes
  ) {
    return Response.json(
      { error: "Solicitação maior que o limite permitido." },
      { status: 413 },
    );
  }
  return null;
}
