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
  "subscribe(sealed)",
  "renew()",
]) {
  assert.ok(browserSource.includes(token), "Missing browser integration: " + token);
}

console.log("Neon source smoke test passed: browser build, Auth, Object Storage, Functions, AI Gateway and Realtime.");
