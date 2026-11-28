import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const workerDir = path.join(process.cwd(), "cloudflare", "platform-worker");
const configPath = path.join(workerDir, "wrangler.toml");
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const apiToken = process.env.CLOUDFLARE_API_TOKEN || "";

if (!accountId || !apiToken) {
  console.error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
  process.exit(2);
}

const childEnv = { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: apiToken };
function run(args) {
  try {
    return execFileSync("npx", ["--yes", "wrangler", ...args], {
      cwd: workerDir, env: childEnv, encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024
    });
  } catch {
    // Never print Wrangler args/stdout/stderr: Hyperdrive args may contain DB passwords.
    throw new Error("Cloudflare resource command failed. Check token scopes and resource settings.");
  }
}
async function readConfig() { return readFile(configPath, "utf8"); }
async function appendBinding(block, binding) {
  const current = await readConfig();
  const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const activeBinding = new RegExp("^\\s*binding\\s*=\\s*[\"\\']" + escaped + "[\"\\']\\s*$", "m");
  if (activeBinding.test(current)) return false;
  await writeFile(configPath, current.trimEnd() + "\n\n" + block.trim() + "\n", "utf8");
  return true;
}
function parseJson(text, label) {
  try { return JSON.parse(text); } catch { throw new Error("Could not safely parse Cloudflare " + label + " output."); }
}
function listItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.databases)) return payload.databases;
  if (Array.isArray(payload?.buckets)) return payload.buckets;
  return [];
}
const report = [];

// R2: list first; create only when the user explicitly enables CF_CREATE_R2.
const r2Name = (process.env.CF_R2_BUCKET_NAME || "").trim();
if (process.env.CF_CREATE_R2 === "true") {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(r2Name)) throw new Error("CF_R2_BUCKET_NAME must be 3-63 lowercase letters, numbers or hyphens.");
  const buckets = listItems(parseJson(run(["r2", "bucket", "list", "--json"]), "R2 bucket list"));
  const exists = buckets.some((item) => item.name === r2Name || item.bucketName === r2Name);
  if (!exists) {
    run(["r2", "bucket", "create", r2Name, "--location", process.env.CF_R2_LOCATION || "apac"]);
    report.push("Created R2 bucket " + r2Name + ".");
  } else {
    report.push("R2 bucket " + r2Name + " already exists; retained existing data.");
  }
  const block = ["[[r2_buckets]]", 'binding = "R2"', 'bucket_name = "' + r2Name + '"'].join("\n");
  if (await appendBinding(block, "R2")) report.push("Added R2 binding to Worker configuration.");
}

// D1: an empty D1 database is created only when explicitly selected.
const d1Name = (process.env.CF_D1_DATABASE_NAME || "").trim();
if (process.env.CF_CREATE_D1 === "true") {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(d1Name)) throw new Error("CF_D1_DATABASE_NAME is invalid.");
  const databases = listItems(parseJson(run(["d1", "list", "--json"]), "D1 database list"));
  let database = databases.find((item) => item.name === d1Name);
  if (!database) {
    run(["d1", "create", d1Name, "--location", process.env.CF_D1_LOCATION || "apac"]);
    const refreshed = listItems(parseJson(run(["d1", "list", "--json"]), "D1 database list"));
    database = refreshed.find((item) => item.name === d1Name);
    if (!database) throw new Error("D1 was created, but its database id could not be verified. No D1 binding was written.");
    report.push("Created an empty D1 database " + d1Name + "; no Neon data was copied.");
  } else {
    report.push("D1 database " + d1Name + " already exists; retained its data.");
  }
  const databaseId = database.uuid || database.database_id || database.id;
  if (!databaseId) throw new Error("D1 database id is missing; refusing to write an incomplete binding.");
  const block = ["[[d1_databases]]", 'binding = "DB"', 'database_name = "' + d1Name + '"', 'database_id = "' + databaseId + '"'].join("\n");
  if (await appendBinding(block, "DB")) report.push("Added D1 binding to Worker configuration.");
}

// Hyperdrive: existing IDs are linked without creating a duplicate; URLs create a new config.
async function configureHyperdrive({ binding, name, id, connectionString, protocol }) {
  if (id) {
    const block = ["[[hyperdrive]]", 'binding = "' + binding + '"', 'id = "' + id + '"'].join("\n");
    if (await appendBinding(block, binding)) report.push("Added existing Hyperdrive binding " + binding + ".");
    return;
  }
  if (!connectionString) return;
  if (!connectionString.toLowerCase().startsWith(protocol + "://")) throw new Error(binding + " connection string uses the wrong database protocol.");
  const args = ["hyperdrive", "create", name, "--connection-string", connectionString];
  run(args);
  const entriesText = run(["hyperdrive", "list"]);
  const lines = entriesText.split(/\\r?\\n/).filter(Boolean);
  const match = lines.find((line) => line.includes(name));
  const idMatch = match?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!idMatch) throw new Error("Hyperdrive was created but its id could not be verified; add it manually before deploying.");
  const block = ["[[hyperdrive]]", 'binding = "' + binding + '"', 'id = "' + idMatch[0] + '"'].join("\n");
  if (await appendBinding(block, binding)) report.push("Created and bound Hyperdrive " + name + ".");
}
await configureHyperdrive({
  binding: "HYPERDRIVE",
  name: process.env.CF_HYPERDRIVE_NAME || "hendy-neon-postgres",
  id: process.env.CF_HYPERDRIVE_ID || "",
  connectionString: process.env.CF_HYPERDRIVE_CONNECTION_STRING || "",
  protocol: "postgres"
});
await configureHyperdrive({
  binding: "MYSQL_HYPERDRIVE",
  name: process.env.CF_MYSQL_HYPERDRIVE_NAME || "hendy-mysql",
  id: process.env.CF_MYSQL_HYPERDRIVE_ID || "",
  connectionString: process.env.CF_MYSQL_HYPERDRIVE_CONNECTION_STRING || "",
  protocol: "mysql"
});

const current = await readConfig();
let updated = current;
if (process.env.CF_DATABASE_PROVIDER) {
  const value = process.env.CF_DATABASE_PROVIDER.toLowerCase();
  if (!["none", "postgres", "mysql", "d1"].includes(value)) throw new Error("CF_DATABASE_PROVIDER must be none, postgres, mysql or d1.");
  updated = updated.replace(/^DATABASE_PROVIDER\\s*=\\s*"[^"]*"$/m, 'DATABASE_PROVIDER = "' + value + '"');
  report.push("Selected Worker database provider " + value + ".");
}
if (process.env.CF_OBJECT_STORAGE_PROVIDER) {
  const value = process.env.CF_OBJECT_STORAGE_PROVIDER.toLowerCase();
  if (!["neon", "cloudfly", "r2", "s3"].includes(value)) throw new Error("CF_OBJECT_STORAGE_PROVIDER is invalid.");
  updated = updated.replace(/^OBJECT_STORAGE_PROVIDER\\s*=\\s*"[^"]*"$/m, 'OBJECT_STORAGE_PROVIDER = "' + value + '"');
  report.push("Selected Worker storage provider " + value + ".");
}
if (updated !== current) await writeFile(configPath, updated, "utf8");
console.log(report.length ? report.join("\n") : "No Cloudflare resources selected; nothing changed.");
console.log("No resources were deleted and no database contents were migrated.");
