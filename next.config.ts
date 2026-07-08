import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@estuary-ai/sdk"],
  // Pin the Turbopack root to this repo. Without this, Turbopack infers the
  // parent monorepo (outermost pnpm-lock.yaml) as the project root, and a
  // module graph can span both the monorepo's .pnpm store and this repo's
  // standalone .pnpm store — two copies of next/react that crash at runtime
  // with "module factory is not available".
  turbopack: {
    root: path.join(__dirname),
  },
  // Send only the origin (no path / no query) on cross-origin requests so
  // share tokens in the URL are not leaked to third-party sites when users
  // click outbound links. `no-referrer` also worked for this but stripped the
  // Origin header on cross-origin POSTs, breaking the share-token exchange
  // when demo and gateway are on different origins (quick-260414-ith).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
