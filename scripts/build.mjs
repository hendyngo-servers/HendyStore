import { mkdir, readFile } from "node:fs/promises";
import { build, transform } from "esbuild";

// Parse the infrastructure file during the ordinary app build as an early syntax check.
const neonConfig = await readFile("neon.ts", "utf8");
await transform(neonConfig, { loader: "ts", target: "es2022" });

await mkdir("js", { recursive: true });
await build({
  entryPoints: ["src/neon-browser.js"],
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  outfile: "js/neon-client.bundle.js",
});

console.log("Hendy Store browser bundle built: js/neon-client.bundle.js");
