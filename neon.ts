import { defineConfig } from "@neon/config/v1";

const appOrigin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : "https://hendy-store.onrender.com";

export default defineConfig({
  auth: true,
  aiGateway: true,
  buckets: {
    "hendy-store-files": {},
  },
  functions: {
    storeapi: {
      name: "Hendy Store health and live catalog",
      source: "./neon/functions/storeapi.ts",
    },
  },
  preview: {
    realtime: {
      allowedOrigins: [appOrigin],
    },
  },
});
