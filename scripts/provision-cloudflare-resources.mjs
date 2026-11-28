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
      cwd: workerDir,
      env: childEnv,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 8 * 1024 * 1024
    });
  } catch {
    // Do not log CLI arguments or output; resource commands may contain credentials.
    throw new Error("Cloudflare resource command failed. Check token scopes and the selected resource.");
  }
}

async function readConfig() {
  return readFile(configPath, "utf8");
}

async function appendBinding(block, binding) {
  const current = await readConfig();
  const lines = current.split(/\r?\n/);
  const lineIndex = lines.findIndex((line) =>
    line.trim() === 'binding = "' + binding + '"' ||
    line.trim() === "binding = '" + binding + "'"
  );
  if (lineIndex >= 0) {
    let end = lineIndex + 1;
    while (end < lines.length && !lines[end].trimStart().startsWith("[[")) end += 1;
    const section = lines.slice(lineIndex, end).join("\n");
    const expected = block.trim().split(/\r?\n/).slice(2).filter(Boolean);
    if (!expected.every((line) => section.includes(line))) {
      throw new Error("Binding " + binding + " already targets another resource. Refusing to overwrite it.");
    }
    return false;
  }
  await writeFile(configPath, current.trimEnd() + "\n\n" + block.trim() + "\n", "utf8");
  return true;
}

function parseJson(raw, label) {
  try {
    const parsed = JSON.parse(raw);
    return parsed?.result ?? parsed;
  } catch {
    throw new Error("Could not safely parse Cloudflare " + label + " output.");
  }
}

function namedItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.buckets)) return data.buckets;
  if (Array.isArray(data?.databases)) return data.databases;
  if (Array.isArray(data?.result)) return data.result;
  return [];
}

const report = [];

// R2 must be confirmed private before the application binds it.
const r2Name = String(process.env.CF_R2_BUCKET_NAME || "").trim();
if (process.env.CF_CREATE_R2 === "true" || r2Name) {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(r2Name)) {
    throw new Error("CF_R2_BUCKET_NAME must be 3-63 lowercase letters, numbers or hyphens.");
  }
  if (process.env.CF_R2_PRIVATE_ACCESS_CONFIRMED !== "true") {
    throw new Error("Confirm that public access is disabled for the selected R2 bucket before binding it.");
  }
  const buckets = namedItems(parseJson(run(["r2", "bucket", "list", "--json"]), "R2 bucket list"));
  let exists = buckets.some((item) => item.name === r2Name || item.bucketName === r2Name);
  if (!exists && process.env.CF_CREATE_R2 === "true") {
    run(["r2", "bucket", "create", r2Name, "--location", process.env.CF_R2_LOCATION || "weur"]);
    const refreshed = namedItems(parseJson(run(["r2", "bucket", "list", "--json"]), "R2 bucket list"));
    exists = refreshed.some((item) => item.name === r2Name || item.bucketName === r2Name);
    if (!exists) throw new Error("R2 create command completed but the bucket could not be verified.");
    report.push("Created an empty private R2 bucket " + r2Name + ".");
  }
  if (!exists) throw new Error("Selected R2 bucket does not exist; enable CF_CREATE_R2 to create it.");
  const block = ["[[r2_buckets]]", 'binding = "R2"', 'bucket_name = "' + r2Name + '"'].join("\n");
  if (await appendBinding(block, "R2")) report.push("Bound existing R2 bucket " + r2Name + ".");
  else report.push("R2 binding already targets " + r2Name + "; retained.");
}

// KV cache namespace: existing IDs are attached without modifying their data.
const kvName = String(process.env.CF_KV_NAMESPACE_NAME || "hendystore-catalog-cache").trim();
const kvId = String(process.env.CF_KV_NAMESPACE_ID || "").trim();
if (kvId) {
  const block = ["[[kv_namespaces]]", 'binding = "CACHE"', 'id = "' + kvId + '"'].join("\n");
  if (await appendBinding(block, "CACHE")) report.push("Attached existing KV namespace.");
} else if (process.env.CF_CREATE_KV === "true") {
  const current = await readConfig();
  if (current.split(/\r?\n/).some((line) => line.trim() === 'binding = "CACHE"')) {
    throw new Error("CACHE binding already exists. Pass its namespace ID rather than creating a replacement.");
  }
  run(["kv", "namespace", "create", kvName, "--binding", "CACHE", "--update-config", "--config", configPath]);
  report.push("Created KV namespace " + kvName + " and added CACHE binding.");
}

// D1 is optional and independent from Neon. This script never imports or edits Neon data.
const d1Name = String(process.env.CF_D1_DATABASE_NAME || "hendystore-edge-db").trim();
const d1Id = String(process.env.CF_D1_DATABASE_ID || "").trim();
if (d1Id) {
  const block = ["[[d1_databases]]", 'binding = "DB"', 'database_name = "' + d1Name + '"', 'database_id = "' + d1Id + '"'].join("\n");
  if (await appendBinding(block, "DB")) report.push("Attached existing D1 database " + d1Name + ".");
} else if (process.env.CF_CREATE_D1 === "true") {
  const databases = namedItems(parseJson(run(["d1", "list", "--json"]), "D1 database list"));
  let database = databases.find((item) => item.name === d1Name);
  if (!database) {
    run(["d1", "create", d1Name, "--location", process.env.CF_D1_LOCATION || "weur"]);
    const refreshed = namedItems(parseJson(run(["d1", "list", "--json"]), "D1 database list"));
    database = refreshed.find((item) => item.name === d1Name);
    if (!database) throw new Error("D1 create command completed but the database ID could not be verified.");
    report.push("Created empty D1 database " + d1Name + "; no Neon data was copied.");
  } else {
    report.push("D1 database " + d1Name + " already exists; its contents were retained.");
  }
  const id = database.uuid || database.database_id || database.databaseId || database.id;
  if (!id) throw new Error("D1 database ID is missing; refusing to write an incomplete binding.");
  const block = ["[[d1_databases]]", 'binding = "DB"', 'database_name = "' + d1Name + '"', 'database_id = "' + id + '"'].join("\n");
  if (await appendBinding(block, "DB")) report.push("Added D1 binding.");
}

// Select only the direct PHP origin or a native D1 binding; no Hyperdrive/SQL proxy.
if (process.env.CF_DATABASE_PROVIDER) {
  const value = process.env.CF_DATABASE_PROVIDER.toLowerCase();
  if (!["origin", "d1"].includes(value)) throw new Error("CF_DATABASE_PROVIDER must be origin or d1.");
  if (value === "d1") {
    const config = await readConfig();
    if (!config.includes('binding = "DB"')) throw new Error("Cannot select D1 before the DB binding exists.");
  }
  const current = await readConfig();
  const lines = current.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trimStart().startsWith("DATABASE_PROVIDER ="));
  if (index < 0) throw new Error("DATABASE_PROVIDER is missing from Worker TOML.");
  lines[index] = 'DATABASE_PROVIDER = "' + value + '"';
  await writeFile(configPath, lines.join("\n"), "utf8");
  report.push("Selected Worker database mode " + value + ".");
}

if (process.env.CF_OBJECT_STORAGE_PROVIDER) {
  const value = process.env.CF_OBJECT_STORAGE_PROVIDER.toLowerCase();
  if (!["neon", "cloudfly", "r2", "s3"].includes(value)) throw new Error("CF_OBJECT_STORAGE_PROVIDER is invalid.");
  if (value === "r2" && !(await readConfig()).includes('binding = "R2"')) {
    throw new Error("Cannot select R2 before the R2 binding exists.");
  }
  const current = await readConfig();
  const lines = current.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trimStart().startsWith("OBJECT_STORAGE_PROVIDER ="));
  if (index < 0) throw new Error("OBJECT_STORAGE_PROVIDER is missing from Worker TOML.");
  lines[index] = 'OBJECT_STORAGE_PROVIDER = "' + value + '"';
  await writeFile(configPath, lines.join("\n"), "utf8");
  report.push("Selected Worker storage provider " + value + ".");
}

console.log(report.length ? report.join("\n") : "No Cloudflare resources selected; nothing changed.");
console.log("No resources were deleted and no database contents were migrated.");
