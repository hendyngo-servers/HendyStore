import { Client as PgClient } from "pg";
import mysql from "mysql2/promise";
import type { Env } from "./types.js";

export type DatabaseProvider = "postgres" | "mysql" | "d1" | "none";

export function resolveDatabaseProvider(env: Env): DatabaseProvider {
  const configured = String(env.DATABASE_PROVIDER || "postgres").toLowerCase();
  if (configured === "postgres" && env.HYPERDRIVE) return "postgres";
  if (configured === "mysql" && env.MYSQL_HYPERDRIVE) return "mysql";
  if (configured === "d1" && env.DB) return "d1";
  if (configured === "none") return "none";
  throw new Error("Database provider binding is missing or does not match DATABASE_PROVIDER.");
}

export async function probeDatabase(env: Env): Promise<{ provider: DatabaseProvider; ok: boolean }> {
  const provider = resolveDatabaseProvider(env);
  if (provider === "none") {
    // In edge-proxy mode the PHP origin remains the database owner. Probe that
    // origin rather than marking a proxy-only Worker unhealthy for no local DB.
    const rawOrigin = String(env.HENDY_API_ORIGIN || "");
    const origin = rawOrigin.endsWith("/") ? rawOrigin.slice(0, -1) : rawOrigin;
    if (!origin.startsWith("https://")) return { provider, ok: false };
    try {
      const response = await fetch(origin + "/api.php?action=health", { headers: { Accept: "application/json" } });
      if (!response.ok) return { provider, ok: false };
      const health = await response.json() as { ok?: boolean; database?: string };
      return { provider, ok: health.ok === true && Boolean(health.database) };
    } catch {
      return { provider, ok: false };
    }
  }

  if (provider === "d1") {
    await env.DB!.prepare("SELECT 1 AS ok").first();
    return { provider, ok: true };
  }

  if (provider === "postgres") {
    const client = new PgClient({
      connectionString: env.HYPERDRIVE!.connectionString,
      connectionTimeoutMillis: 5000,
      statement_timeout: 8000
    });
    try {
      await client.connect();
      await client.query("SELECT 1");
      return { provider, ok: true };
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  const connection = await mysql.createConnection(env.MYSQL_HYPERDRIVE!.connectionString);
  try {
    await connection.query("SELECT 1");
    return { provider, ok: true };
  } finally {
    await connection.end();
  }
}