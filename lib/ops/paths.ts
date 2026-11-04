/** The console's own address space: pages and their API (D-157). No `server-only`: the proxy and the client share it. */
export function isOpsPath(pathname: string): boolean {
  return pathname === "/ops" || pathname.startsWith("/ops/");
}

export function isOpsApi(pathname: string): boolean {
  return pathname === "/api/ops" || pathname.startsWith("/api/ops/");
}

/** The only screen of the console open without an operator session. */
export const OPS_LOGIN_PATH = "/ops/login";
