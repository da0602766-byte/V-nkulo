import { AsyncLocalStorage } from "node:async_hooks";

export type R2BucketBinding = {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | Blob,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  get(key: string): Promise<{
    body: ReadableStream;
    httpMetadata?: { contentType?: string };
  } | null>;
};

type RuntimeBindings = {
  DB?: D1Database;
  BUCKET?: R2BucketBinding;
  AUTH_SECRET?: string;
  SYSTEM_OWNER_EMAIL?: string;
  SYSTEM_OWNER_LOCKED_BEFORE?: string;
};

const runtime = new AsyncLocalStorage<RuntimeBindings>();

export function runWithRuntimeEnv<T>(bindings: RuntimeBindings, callback: () => T): T {
  return runtime.run(bindings, callback);
}

export function getRuntimeEnv(): RuntimeBindings {
  return runtime.getStore() ?? {};
}
