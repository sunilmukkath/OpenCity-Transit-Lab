import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // Keep MapLibre's ESM + worker intact under Next bundling.
  transpilePackages: ["maplibre-gl"],
};

export default nextConfig;
