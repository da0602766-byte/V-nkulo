import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { getRuntimeEnv } from "./runtime-env";

export function getDb() {
  const env = getRuntimeEnv();
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(getD1(), { schema });
}

export function getD1() {
  const env = getRuntimeEnv();
  if (!env.DB) {
    throw new Error("O banco de dados do ADOTE ainda não está disponível.");
  }
  // Some pages obtain a database handle before resolving the active tenant.
  // Resolve the destination at execution time so those handles cannot read or
  // write the legacy visitor tables after Drive authorization is attached.
  env.routedDB ??= new Proxy(env.DB, {
    get(_target, key) {
      const target=env.visitorDrive?.db ?? env.DB!;
      const value=Reflect.get(target,key,target);
      return typeof value==='function'?value.bind(target):value;
    },
  });
  return env.routedDB;
}
