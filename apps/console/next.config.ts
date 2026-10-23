import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@clinic/ui"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
