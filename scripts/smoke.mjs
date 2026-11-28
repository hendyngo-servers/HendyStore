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
