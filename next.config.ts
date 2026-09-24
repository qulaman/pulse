import { execSync } from "node:child_process";
import type { NextConfig } from "next";

function git(args: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

/**
 * Which build this is (D-115, lib/version.ts). This file is evaluated by several build
 * workers, so nothing here may read the clock: a Date.now() would give the client and the
 * server bundles different ids, and the «new version» line would never go away. The id is
 * the Vercel deployment — a redeploy or a rollback changes it exactly as it changes what
 * the server runs; without it (a local build), the commit.
 */
const sha = process.env.VERCEL_GIT_COMMIT_SHA || git("rev-parse HEAD");
const buildId = process.env.VERCEL_DEPLOYMENT_ID || (sha ? `git-${sha.slice(0, 12)}` : "dev");

const nextConfig: NextConfig = {
  // next dev would otherwise append an `nextjs-agent-rules` block to our CLAUDE.md
  agentRules: false,
  // the floating dev badge sits exactly on the first tab of the bottom bar
  devIndicators: false,
  // inlined into the client and the server bundles alike: both halves of one build agree
  env: {
    PULSE_BUILD_ID: buildId,
    PULSE_BUILD_SHA: sha.slice(0, 7),
    PULSE_BUILD_AT: git("log -1 --format=%cI"),
  },
};

export default nextConfig;
