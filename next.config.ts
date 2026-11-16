import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/overpass",
        destination: "https://overpass-api.de/api/interpreter",
      },
      {
        source: "/api/nominatim",
        destination: "https://nominatim.openstreetmap.org/search",
      },
    ];
  },
};

export default nextConfig;
