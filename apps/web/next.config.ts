import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  transpilePackages: ["maplibre-gl"],
  // Old multi-page lab routes → hubs (content lives there now)
  async redirects() {
    return [
      { source: "/analytics", destination: "/for/planner", permanent: false },
      { source: "/objectives", destination: "/for/planner", permanent: false },
      { source: "/recommendations", destination: "/for/planner", permanent: false },
    ];
  },
};

export default nextConfig;
