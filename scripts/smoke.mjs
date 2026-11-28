import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

await access("js/neon-client.bundle.js");
const neonConfig = await readFile("neon.ts", "utf8");
for (const token of [
  "auth: true",
  "aiGateway: true",
  "hendy-store-files",
  "functions:",
  "realtime:",
  "allowedOrigins",
]) {
  assert.ok(neonConfig.includes(token), "Missing Neon config: " + token);
}

const apiSource = await readFile("api.php", "utf8");
assert.ok(apiSource.includes("GOOGLE_OAUTH_ENABLED"), "Google OAuth feature flag must be server-controlled");

const bootstrapSource = await readFile("config/bootstrap.php", "utf8");
assert.ok(bootstrapSource.includes("unlinked social identity"), "Social identity must not inherit an unlinked Admin role");
assert.ok(bootstrapSource.includes("neon_auth_subject"), "Social identities must map to a stable auth subject");

const homeSource = await readFile("index.php", "utf8");
assert.ok(homeSource.includes("googleSignInButton"), "Homepage must expose the feature-gated Google sign-in control");
assert.ok(homeSource.includes("accountMenu"), "Signed-in users need an account menu");
assert.ok(!homeSource.includes("accountAdminLink"), "Admin console must not be exposed in the public account menu");
assert.ok(!homeSource.includes('href="tech-stack/"'), "Technology stack links must be hidden from the public storefront");

const bootstrapStorageSource = await readFile("config/bootstrap.php", "utf8");
for (const token of [
  "OBJECT_STORAGE_PROVIDER",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_REGION",
  "s3.cloudfly.vn",
  "OBJECT_STORAGE_LEGACY_NEON_READ_FALLBACK",
  "object_storage_s3_client",
]) {
  assert.ok(bootstrapStorageSource.includes(token), "Missing S3-compatible storage support: " + token);
}
const workerSource = await readFile("cloudflare/platform-worker/src/index.ts", "utf8");
for (const token of [
  "/api/v2/platform/health",
  "/api/v2/platform/capabilities",
  "Authorization",
  "X-CSRF-Token",
  "isPublicCatalog",
  "expirationTtl: 30",
]) {
  assert.ok(workerSource.includes(token), "Missing Cloudflare Worker API behavior: " + token);
}
assert.ok(workerSource.includes('incoming.searchParams.get("action") === "products"'), "KV cache must be limited to the public catalogue action");
assert.ok(workerSource.includes('!request.headers.has("Authorization")'), "KV cache must exclude authenticated requests");
assert.ok(workerSource.includes('!request.headers.has("Cookie")'), "KV cache must exclude cookie-bearing requests");

const workerDatabase = await readFile("cloudflare/platform-worker/src/database.ts", "utf8");
for (const token of ["origin", "env.DB", "prepare", "SELECT 1"]) {
  assert.ok(workerDatabase.includes(token), "Missing Cloudflare database adapter: " + token);
}
const workerStorage = await readFile("cloudflare/platform-worker/src/storage.ts", "utf8");
for (const token of ["cloudfly", "r2", "s3", "createPresignedPutUrl", "HeadBucketCommand"]) {
  assert.ok(workerStorage.includes(token), "Missing Worker object storage adapter: " + token);
}
const provisionSource = await readFile("scripts/provision-cloudflare-resources.mjs", "utf8");
for (const token of ["CF_CREATE_R2", "CF_CREATE_KV", "CF_CREATE_D1", "CF_R2_PRIVATE_ACCESS_CONFIRMED", "origin", "refusing to overwrite it"]) {
  assert.ok(provisionSource.includes(token), "Missing explicit Cloudflare provisioning safety gate: " + token);
}
assert.ok(!provisionSource.includes("r2 bucket delete"), "Provisioning must never delete R2 buckets");
assert.ok(!provisionSource.toLowerCase().includes("hyperdrive"), "Provisioning must not configure Hyperdrive");
assert.ok(!workerDatabase.toLowerCase().includes("hyperdrive"), "Worker database adapter must not use Hyperdrive");
assert.ok(!workerDatabase.includes("mysql2"), "Worker database adapter must not include MySQL");
assert.ok(!provisionSource.includes("d1 delete"), "Provisioning must never delete D1 databases");
const architecture = await readFile("docs/architecture/target-architecture.md", "utf8");
assert.ok(!/Azure Front Door|Azure SQL|Azure Blob|Python package worker|Hyperdrive/i.test(architecture), "Target architecture must not reference retired Azure or worker components");
const nextPage = await readFile("apps/storefront-next/src/app/page.tsx", "utf8");
const nextDetail = await readFile("apps/storefront-next/src/app/apps/[slug]/page.tsx", "utf8");
const nextApi = await readFile("apps/storefront-next/src/lib/api.ts", "utf8");
for (const [source, token, label] of [
  [nextPage, "force-dynamic", "live Next storefront catalogue"],
  [nextDetail, "SoftwareApplication", "SEO structured application details"],
  [nextDetail, "screenshots", "application screenshots"],
  [nextDetail, "SHA-256", "public integrity checksums"],
  [nextApi, "store_product_extras", "application extras API client"],
]) {
  assert.ok(source.includes(token), "Missing " + label);
}
const infraPage = await readFile("admin/infrastructure.php", "utf8");
const infraClient = await readFile("admin/infrastructure.js", "utf8");
assert.ok(infraPage.includes('id="infraWorkspace" hidden'), "Infrastructure controls must start hidden until Admin authorization");
assert.ok(infraClient.includes("user?.role === 'admin'"), "Infrastructure page must require an Admin session");
const platformWorkflow = await readFile(".github/workflows/deploy-platform.yml", "utf8");
assert.ok(platformWorkflow.includes("workflow_dispatch:"), "Cloudflare deployments must be manually triggered");
assert.ok(!/^\s+push:/m.test(platformWorkflow.split("\n").slice(0,12).join("\n")), "Cloudflare deployments must not auto-run on normal pushes");

for (const [path, token] of [
  ["js/custom.261126163157.js", "response.status===419"],
  ["admin/security.js", "response.status === 419"],
  ["developer/console.js", "response.status === 419"],
  ["admin/admin.js", "response.status === 419"],
  ["admin/store-features.js", "response.status===419"],
  ["library/library.js", "response.status === 419"],
]) {
  const source = await readFile(path, "utf8");
  assert.ok(source.includes(token), "Missing automatic CSRF recovery in " + path);
}

const securitySource = await readFile("features/security.php", "utf8");
for (const token of [
  "app_developer_profiles",
  "app_security_packages",
  "app_release_security",
  "VIRUSTOTAL_API_KEY",
  "sha256",
  "createPresignedRequest",
  "trust_release_review",
  "moderation_status",
  "scan_status",
  "package_size_bytes",
  "upload_method",
  "moderation_status",
  "developer_rollback",
  "developer_review_reply",
]) {
  assert.ok(securitySource.includes(token), "Missing Trust & Safety integration: " + token);
}
const developerPage = await readFile("developer/index.php", "utf8");
const developerClient = await readFile("developer/console.js", "utf8");
const adminTrustPage = await readFile("admin/security.php", "utf8");
const adminTrustClient = await readFile("admin/security.js", "utf8");
for (const [source, token, label] of [
  [developerPage, "Developer Console", "Developer Console page"],
  [developerClient, "developer_upload_intent", "Developer direct upload flow"],
  [developerClient, "developer_submit", "Developer release submission"],
  [adminTrustPage, "Kiểm duyệt & Bảo mật", "Admin moderation page"],
  [adminTrustClient, "trust_release_review", "Admin release approval"],
]) {
  assert.ok(source.includes(token), "Missing " + label);
}


const functionSource = await readFile("neon/functions/storeapi.ts", "utf8");
for (const token of [
  "createRealtime",
  "HeadBucketCommand",
  "NEON_AI_GATEWAY_BASE_URL",
  "NEON_AUTH_BASE_URL",
  "DATABASE_URL",
  "catalog-live",
]) {
  assert.ok(functionSource.includes(token), "Missing Neon service integration: " + token);
}

const dataApiMigration = await readFile("database/migrations/20261128_public_catalog_data_api.sql", "utf8");
for (const token of [
  "api_public_catalog",
  "security_barrier = true",
  "GRANT SELECT ON TABLE public.api_public_catalog TO anonymous, authenticated",
  "price_type",
  "price_amount_vnd",
]) {
  assert.ok(dataApiMigration.includes(token), "Missing least-privilege Data API migration: " + token);
}
assert.ok(!dataApiMigration.includes("GRANT SELECT ON ALL TABLES"), "Data API must not receive blanket table grants");
assert.ok(!dataApiMigration.includes("download_url"), "Public catalogue view must not expose package URLs");

const browserSource = await readFile("src/neon-browser.js", "utf8");
for (const token of [
  "@neondatabase/auth",
  "@neon/realtime/client",
  "signIn.email",
  "signUp.email",
  "signIn.social",
  "signInGoogle",
  "googleOAuthEnabled",
  "getJWTToken",
  "getSession",
  "allowAnonymous",
  "listPublicCatalog",
  "api_public_catalog",
  "config.dataApiUrl",
  "subscribe(sealed)",
  "renew()",
]) {
  assert.ok(browserSource.includes(token), "Missing browser integration: " + token);
}

console.log("Neon source smoke test passed: Auth, least-privilege Data API catalogue, Object Storage, Functions, AI Gateway and Realtime.");
