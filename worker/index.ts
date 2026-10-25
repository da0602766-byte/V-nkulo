/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { runWithRuntimeEnv } from "../db/runtime-env";
import type { R2BucketBinding } from "../db/runtime-env";
import { runPlatformOptimizationIfDue } from "../app/lib/platform-optimizer";
import { purgeExpiredPrivateMessagesIfDue } from "../app/lib/chat-retention";
import { runAutoSyncIfDue } from "../app/lib/supabase-auto-sync";
import { scheduleWebPushDelivery } from "../app/lib/push-delivery-queue";
import { purgeAccessRequests } from "../app/lib/access-retention";
import { syncPendingVisitorSheets } from "../app/lib/visitor-sheets";
import { purgeVisitorSharingHistory } from '../app/lib/visitor-sharing-history';
import { getRuntimeEnv } from '../db/runtime-env';
import { VisitorDriveError } from '../app/lib/visitor-drive-store';

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET: R2BucketBinding;
  AUTH_SECRET: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
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
let nextAutoSyncCheckAt = 0;
let nextPushQueueCheckAt = 0;
let nextAccessCleanupAt = 0;
let nextVisitorSheetCheckAt = 0;
const AUTO_SYNC_CHECK_MS = 60_000;
const AUTO_SYNC_MUTATION_PATHS = [
  "/api/auth/cadastro", "/api/conta/perfil", "/api/pilot/pessoas",
  "/api/pilot/comunidades", "/api/pilot/solicitacoes-entrada/",
  "/api/pilot/usuarios-cadastro", "/api/pilot/convites/aceitar",
  "/api/proprietario", "/api/public/cadastro-membro/",
];

function relevantCatalogMutation(pathname: string, method: string) {
  if (!UNSAFE_METHODS.has(method) || pathname.startsWith("/api/proprietario/integracoes/")) return false;
  return AUTO_SYNC_MUTATION_PATHS.some(path => pathname === path || (path.endsWith("/") && pathname.startsWith(path))
    || (["/api/pilot/pessoas", "/api/pilot/comunidades"].includes(path) && pathname.startsWith(`${path}/`)));
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const resetRequest = url.pathname === '/api/proprietario/reset';
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
        !resetRequest && url.pathname !== "/api/proprietario/otimizacao" &&
        Date.now() >= nextOptimizerCheckAt
      ) {
        nextOptimizerCheckAt = Date.now() + OPTIMIZER_CHECK_INTERVAL_MS;
        ctx.waitUntil(
          runPlatformOptimizationIfDue(env.DB).catch(() => undefined),
        );
      }
      // Limpeza semanal das mensagens privadas: não é opcional (ver
      // app/lib/chat-retention.ts), então roda fora do otimizador
      // configurável acima e em toda requisição (a própria função se
      // limita a checar o banco uma vez a cada poucos minutos).
      if (!resetRequest) ctx.waitUntil(
        purgeExpiredPrivateMessagesIfDue(env.DB).catch(() => undefined),
      );

      const revisionHeader=request.headers.get('X-Vinkulo-Visitor-Revision');
      const response = await runWithRuntimeEnv({ ...env, executionContext: ctx, requestUrl:request.url, requestMethod:request.method,visitorExpectedRevision:revisionHeader===null?undefined:Number(revisionHeader) }, async () => {
        try {
          const result=await handler.fetch(request, env, ctx);
          const drive=getRuntimeEnv().visitorDrive;
          if(!drive)return result;
          // Complete streamed reads before releasing and clearing request-local memory.
          const body=await result.arrayBuffer();
          if(drive.error){await drive.finish(false);return Response.json({error:drive.error.message},{status:drive.error.status,headers:{'Cache-Control':'no-store'}});}
          await drive.finish(result.status<400);
          const headers=new Headers(result.headers);headers.set('Cache-Control','private, no-store');
          return new Response(body,{status:result.status,statusText:result.statusText,headers});
        } catch(error) {
          await getRuntimeEnv().visitorDrive?.finish(false).catch(()=>undefined);
          if(error instanceof VisitorDriveError || String(error).includes('VISITOR_DRIVE_REQUIRED'))return Response.json({error:error instanceof VisitorDriveError?error.message:'A migração protege os dados contra alterações. Conclua ou cancele a preparação em Visitantes.'},{status:error instanceof VisitorDriveError?error.status:409,headers:{'Cache-Control':'no-store'}});
          throw error;
        }
      });
      if (resetRequest) return withSecurityHeaders(response, url.pathname);
      const now = Date.now();
      const visitorMutation = UNSAFE_METHODS.has(request.method) && /^\/api\/(pilot\/(visitantes|acompanhamentos|celulas|visitante-categorias)|mobile\/visitors)(\/|$)/.test(url.pathname);
      if (response.status < 400 && (visitorMutation || now >= nextVisitorSheetCheckAt) && url.pathname.startsWith("/api/") && !url.pathname.includes("/planilha")) {
        nextVisitorSheetCheckAt = now + 60000;
        ctx.waitUntil(runWithRuntimeEnv({ ...env, executionContext: ctx }, () => syncPendingVisitorSheets(env.DB).catch(() => undefined)));
      }
      if (now >= nextAccessCleanupAt && env.DB) {
        nextAccessCleanupAt = now + 10 * 60_000;
        ctx.waitUntil(purgeAccessRequests(env.DB).catch(() => undefined));
        ctx.waitUntil(purgeVisitorSharingHistory(env.DB).catch(() => undefined));
      }
      if (response.status < 400 && now >= nextPushQueueCheckAt &&
          url.pathname !== "/api/system/supabase-sync" &&
          (url.pathname.startsWith("/api/") || url.pathname === "/painel" || url.pathname === "/proprietario")) {
        nextPushQueueCheckAt = now + 30_000;
        runWithRuntimeEnv({ ...env, executionContext: ctx }, () => scheduleWebPushDelivery(env.DB, "traffic"));
      }
      const forced = response.status < 400 && relevantCatalogMutation(url.pathname, request.method);
      if (forced || (now >= nextAutoSyncCheckAt && (url.pathname === "/painel" || url.pathname === "/proprietario" || url.pathname.startsWith("/api/")))) {
        nextAutoSyncCheckAt = now + AUTO_SYNC_CHECK_MS;
        ctx.waitUntil(runWithRuntimeEnv({ ...env, executionContext: ctx }, () =>
          runAutoSyncIfDue(env.DB, { force: forced }).catch(() => undefined)));
      }
      return withSecurityHeaders(response, url.pathname);
    } catch (error) {
      if (url.pathname.startsWith("/api/") && /PLAN_([A-Z_]*LIMIT|INACTIVE)/.test(String(error))) {
        return withSecurityHeaders(Response.json({error:"O plano da comunidade está inativo ou atingiu o limite deste recurso. Consulte o responsável."},{status:409}),url.pathname);
      }
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
    "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
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
    pathname.startsWith("/redefinir-senha") || pathname.startsWith("/contratacao/") || pathname.startsWith("/cadastro-membro/")
  ) {
    headers.set("Referrer-Policy", "no-referrer");
  }
  if (
    pathname.startsWith("/api/") ||
    pathname === "/painel" ||
    pathname === "/login" || pathname === "/log1" || pathname === "/vincular-cpf" || pathname.startsWith("/redefinir-senha") || pathname.startsWith("/proprietario") || pathname.startsWith("/contratacao/") || pathname.startsWith("/cadastro-membro/") ||
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
    url.pathname === '/api/pilot/visitantes/armazenamento' ? 5 * 1024 * 1024 :
    /^\/api\/proprietario\/modulos\/[a-f0-9-]{36}\/imagens$/.test(url.pathname)
      ? 8 * 1024 * 1024
      : url.pathname === "/api/pilot/uploads"
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
