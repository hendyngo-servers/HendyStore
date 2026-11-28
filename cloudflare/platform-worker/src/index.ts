import type { Env } from "./types.js";
import { probeDatabase, resolveDatabaseProvider } from "./database.js";
import { probeStorage, resolveStorageProvider } from "./storage.js";

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const resultHeaders = new Headers(headers);
  resultHeaders.set("Content-Type", "application/json; charset=utf-8");
  resultHeaders.set("Cache-Control", "no-store, private");
  resultHeaders.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { status, headers: resultHeaders });
}

function allowedOrigin(request: Request, env: Env): string {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGIN || "");
  return origin && allowed && origin === allowed ? origin : "";
}

function withCors(request: Request, env: Env, response: Response): Response {
  const origin = allowedOrigin(request, env);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type,X-CSRF-Token");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function proxyToPhp(request: Request, env: Env): Promise<Response> {
  const origin = String(env.HENDY_API_ORIGIN || "").replace(/\/$/, "");
  if (!origin.startsWith("https://")) return json({ ok: false, error: "HENDY_API_ORIGIN must be an HTTPS origin." }, 503);
  const incoming = new URL(request.url);
  const target = new URL(origin + incoming.pathname + incoming.search);
  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-Host", incoming.host);
  headers.set("X-Forwarded-Proto", "https");
  headers.delete("host");
  const upstream = await fetch(new Request(target, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "manual"
  }));
  const response = new Response(upstream.body, upstream);
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

async function platformHealth(env: Env): Promise<Response> {
  const checks: Record<string, unknown> = {
    databaseProvider: resolveDatabaseProvider(env),
    storageProvider: resolveStorageProvider(env)
  };
  try {
    checks.database = await probeDatabase(env);
  } catch (error) {
    checks.database = { ok: false, error: error instanceof Error ? error.message : "Database probe failed." };
  }
  try {
    checks.storage = await probeStorage(env);
  } catch (error) {
    checks.storage = { ok: false, error: error instanceof Error ? error.message : "Storage probe failed." };
  }
  const healthy = Boolean((checks.database as { ok?: boolean })?.ok && (checks.storage as { ok?: boolean })?.ok);
  return json({ ok: healthy, service: "hendy-store-platform-worker", checks }, healthy ? 200 : 503);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return withCors(request, env, new Response(null, { status: 204 }));
    }
    if (url.pathname === "/api/v2/platform/health" && request.method === "GET") {
      return withCors(request, env, await platformHealth(env));
    }
    if (url.pathname === "/api/v2/platform/capabilities" && request.method === "GET") {
      return withCors(request, env, json({
        ok: true,
        databaseProviders: ["postgres", "mysql", "d1"],
        configuredDatabaseProvider: env.DATABASE_PROVIDER || "postgres",
        storageProviders: ["neon", "cloudfly", "r2", "s3"],
        configuredStorageProvider: env.OBJECT_STORAGE_PROVIDER || "neon",
        bindings: {
          d1: Boolean(env.DB),
          postgresHyperdrive: Boolean(env.HYPERDRIVE),
          mysqlHyperdrive: Boolean(env.MYSQL_HYPERDRIVE),
          r2: Boolean(env.R2)
        }
      }));
    }

    // Preserve the existing PHP business API and its authentication/CSRF
    // checks while the new Workers adapter is introduced incrementally.
    if (url.pathname === "/api.php" || url.pathname.startsWith("/api.php/")) {
      try {
        return withCors(request, env, await proxyToPhp(request, env));
      } catch {
        return withCors(request, env, json({ ok: false, error: "Origin API is temporarily unavailable." }, 502));
      }
    }

    return json({ ok: false, error: "Route not found." }, 404);
  }
};