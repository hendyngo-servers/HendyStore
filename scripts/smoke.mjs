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

const browserSource = await readFile("src/neon-browser.js", "utf8");
for (const token of [
  "@neondatabase/auth",
  "@neon/realtime/client",
  "signIn.email",
  "signUp.email",
  "signIn.social",
  "signInGoogle",
  "googleOAuthEnabled",
  "subscribe(sealed)",
  "renew()",
]) {
  assert.ok(browserSource.includes(token), "Missing browser integration: " + token);
}

console.log("Neon source smoke test passed: browser build, email/social Auth, account menu, Object Storage, Functions, AI Gateway and Realtime.");
