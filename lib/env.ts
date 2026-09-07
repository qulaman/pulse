import "server-only";

import { parseServerEnv, type ServerEnv } from "./env.schema";

let cached: ServerEnv | undefined;

/** Validated server-side env. Never import from client components. */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
