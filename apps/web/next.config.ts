import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  transpilePackages: ["maplibre-gl"],
  async redirects() {
    return [
      { source: "/map", destination: "/last-mile", permanent: false },
      { source: "/analytics", destination: "/assessments", permanent: false },
      { source: "/objectives", destination: "/destinations", permanent: false },
      { source: "/recommendations", destination: "/infrastructure", permanent: false },
      { source: "/for/:hub", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
