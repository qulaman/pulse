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
 * the server runs. A build outside Vercel (a client's own hosting, V-02) gets its id from
 * CI as PULSE_BUILD_ID (a run id); a local build falls back to the commit.
 */
const sha = process.env.VERCEL_GIT_COMMIT_SHA || git("rev-parse HEAD");
const buildId =
  process.env.PULSE_BUILD_ID || process.env.VERCEL_DEPLOYMENT_ID || (sha ? `git-${sha.slice(0, 12)}` : "dev");

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
  experimental: {
    // a tab visited in the last 30 s opens from the router cache, not from the server (D-126):
    // the screens are client pages fed by TanStack Query and Realtime, the server part is the
    // shell and the session — nothing there goes stale in half a minute
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
