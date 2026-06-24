import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    viewTransition: true, // React <ViewTransition> for animated route transitions
  },
};

export default nextConfig;
