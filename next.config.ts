import type { NextConfig } from "next";

// /api/nominatim and /api/overpass are real route handlers in src/app/api/
// (they add identification headers, rate limiting, timeouts and fallbacks).
const nextConfig: NextConfig = {};

export default nextConfig;
