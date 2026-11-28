import type { NextConfig } from "next";

const isRenderBuild = process.env.DEPLOY_TARGET === "render";
const nextConfig: NextConfig = {
  ...(isRenderBuild ? { output: "standalone" as const } : {}),
  poweredByHeader: false,
  compress: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }]
  }
};

export default nextConfig;
