import { ScreenSandbox } from "./ScreenSandbox";

/**
 * /dev/screen — the director's TV remote (D-76, D-96, D-121, D-123) without a login: the real `/screen` page in a
 * phone column. It reads and writes through the ordinary queries, so on its own it shows an empty remote; a test
 * driver answers those requests with fixtures (Playwright `page.route`) and moves the wall's state by hand
 * through `window.__remoteQueryClient`. Dev only (app/dev/layout.tsx).
 */
export default function ScreenSandboxPage() {
  return <ScreenSandbox />;
}
