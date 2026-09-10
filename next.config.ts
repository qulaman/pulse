import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // next dev would otherwise append an `nextjs-agent-rules` block to our CLAUDE.md
  agentRules: false,
  /* config options here */
};

export default nextConfig;
