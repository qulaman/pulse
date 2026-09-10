import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // next dev would otherwise append an `nextjs-agent-rules` block to our CLAUDE.md
  agentRules: false,
  // the floating dev badge sits exactly on the first tab of the bottom bar
  devIndicators: false,
  /* config options here */
};

export default nextConfig;
