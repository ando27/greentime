import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/supabase/:path*",
        destination: "https://fhflxafuvnvafkhwniiz.supabase.co/:path*",
      },
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
