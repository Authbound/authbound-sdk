import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable transpilation of workspace packages
  // Include all Authbound packages that are used directly or transitively
  transpilePackages: [
    "@authbound-sdk/core",
    "@authbound-sdk/server",
    "@authbound-sdk/quickid-react",
  ],
};

export default nextConfig;
