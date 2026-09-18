import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Fly runs the standalone server (see Dockerfile). Vercel ignores this.
  output: "standalone",
  // Ship data/ with the serverless bundle so lesson.json is readable on Vercel.
  outputFileTracingIncludes: { "/*": ["./data/**/*"] },
};

export default nextConfig;
