import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/overpass",
        destination: "https://overpass-api.de/api/interpreter",
      },
    ];
  },
};

export default nextConfig;
