import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@estuary-ai/sdk"],
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
