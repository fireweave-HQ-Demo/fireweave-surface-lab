import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@clinic/ui"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
