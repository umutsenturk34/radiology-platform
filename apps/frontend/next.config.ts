import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const apiBaseUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;

    if (!apiBaseUrl) {
      return [];
    }

    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiBaseUrl.replace(/\/+$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;
