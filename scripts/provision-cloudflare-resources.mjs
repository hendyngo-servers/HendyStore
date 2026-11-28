import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const workerDir = path.join(repoRoot, "cloudflare", "platform-worker");
const configPath = path.join(workerDir, "wrangler.toml");
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const apiToken = process.env.CLOUDFLARE_API_TOKEN || "";

if (!accountId || !apiToken) {
  console.error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
  process.exit(2);
}

const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: apiToken };
function run(args) {
  try {
    return execFileSync("npx", ["--yes", "wrangler", ...args], {
      cwd: workerDir,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 8 * 1024 * 1024
    });
  } catch {
    // Do not print process arguments or provider output: Hyperdrive arguments
    // can include a full database URL and password.
    throw new Error("Cloudflare resource command failed. Check token scopes and resource settings.");
  }
}
function hasResource(command, name) {
  try {
    run([...command, name, "--json"]);
    return true;
  } catch {
    return false;
  }
}
async function appendBinding(block) {
  const current = await readFile(configPath, "utf8");
  if (current.includes(block.trim().split("\\n")[0])) return;
  await writeFile(configPath, current.trimEnd() + "\\n\\n" + block.trim() + "\\n", "utf8");
}

const summary = [];

const r2Name = (process.env.CF_R2_BUCKET_NAME || "").trim();
if (process.env.CF_CREATE_R2 === "true") {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(r2Name)) {
    throw new Error("CF_R2_BUCKET_NAME must be 3-63 lowercase letters, numbers or hyphens.");
  }
  if (!hasResource(["r2", "bucket", "info"], r2Name)) {
    run(["r2", "bucket", "create", r2Name, "--location", process.env.CF_R2_LOCATION || "apac", "--binding", "R2", "--update-config"]);
    summary.push("Created private-by-default R2 bucket and added the Worker binding.");
  } else {
    summary.push("R2 bucket already exists; no bucket data or settings were changed.");
    await appendBinding(\`[[r2_buckets]]
binding = "R2"
bucket_name = "\${r2Name}"\`);
  }
}

const d1Name = (process.env.CF_D1_DATABASE_NAME || "").trim();
if (process.env.CF_CREATE_D1 === "true") {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(d1Name)) throw new Error("CF_D1_DATABASE_NAME is invalid.");
  if (!hasResource(["d1", "info"], d1Name)) {
    run(["d1", "create", d1Name, "--binding", "DB", "--update-config", "--location", process.env.CF_D1_LOCATION || "apac"]);
    summary.push("Created an empty D1 database and added its binding. No Neon data was copied.");
  } else {
    summary.push("D1 database already exists; no data or schema was changed.");
  }
}

const pgConnection = process.env.CF_HYPERDRIVE_CONNECTION_STRING || "";
if (pgConnection) {
  if (!/^(postgres|postgresql):\\/\\//i.test(pgConnection)) throw new Error("CF_HYPERDRIVE_CONNECTION_STRING must be a PostgreSQL URL.");
  run(["hyperdrive", "create", process.env.CF_HYPERDRIVE_NAME || "hendy-neon-postgres", "--connection-string", pgConnection, "--binding", "HYPERDRIVE", "--update-config", "--config", configPath]);
  summary.push("Created a PostgreSQL Hyperdrive binding. The Neon source database was not migrated or modified.");
}

const mysqlConnection = process.env.CF_MYSQL_HYPERDRIVE_CONNECTION_STRING || "";
if (mysqlConnection) {
  if (!/^(mysql|mariadb):\\/\\//i.test(mysqlConnection)) throw new Error("CF_MYSQL_HYPERDRIVE_CONNECTION_STRING must be a MySQL/MariaDB URL.");
  run(["hyperdrive", "create", process.env.CF_MYSQL_HYPERDRIVE_NAME || "hendy-mysql", "--connection-string", mysqlConnection, "--binding", "MYSQL_HYPERDRIVE", "--update-config", "--config", configPath]);
  summary.push("Created a MySQL Hyperdrive binding. No MySQL application data was migrated.");
}

if (process.env.CF_DATABASE_PROVIDER) {
  const provider = process.env.CF_DATABASE_PROVIDER.toLowerCase();
  if (!["none", "postgres", "mysql", "d1"].includes(provider)) throw new Error("CF_DATABASE_PROVIDER must be none, postgres, mysql or d1.");
  let toml = await readFile(configPath, "utf8");
  toml = toml.replace(/^DATABASE_PROVIDER\\s*=\\s*"[^"]*"$/m, \`DATABASE_PROVIDER = "\${provider}"\`);
  await writeFile(configPath, toml, "utf8");
  summary.push("Updated the Worker database provider selector.");
}

if (process.env.CF_OBJECT_STORAGE_PROVIDER) {
  const provider = process.env.CF_OBJECT_STORAGE_PROVIDER.toLowerCase();
  if (!["neon", "cloudfly", "r2", "s3"].includes(provider)) throw new Error("CF_OBJECT_STORAGE_PROVIDER is invalid.");
  let toml = await readFile(configPath, "utf8");
  toml = toml.replace(/^OBJECT_STORAGE_PROVIDER\\s*=\\s*"[^"]*"$/m, \`OBJECT_STORAGE_PROVIDER = "\${provider}"\`);
  await writeFile(configPath, toml, "utf8");
  summary.push("Updated the Worker storage provider selector.");
}

console.log(summary.length ? summary.join("\\n") : "No Cloudflare resources selected; nothing changed.");
console.log("No resources were deleted and no database contents were migrated.");
