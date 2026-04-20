import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@estuary-ai/sdk"],
  // Strip Referer entirely so share tokens in the URL hash / query string are
  // not leaked to third-party sites when users click outbound links.
  // quick-260414-ith.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
