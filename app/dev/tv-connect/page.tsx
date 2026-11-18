import { TvConnectView, type WallView } from "@/app/(auth)/tv-connect/TvConnect";

/** A fixed moment: the time left reads the same on every picture. */
const NOW = Date.UTC(2026, 10, 18, 9, 0, 0);

const CASES: Record<string, WallView> = {
  code: { kind: "code", code: "482918", until: NOW + 9 * 60_000 + 20_000, offline: false },
  last: { kind: "code", code: "482918", until: NOW + 40_000, offline: false },
  "code-offline": { kind: "code", code: "482918", until: NOW + 6 * 60_000, offline: true },
  loading: { kind: "loading" },
  connecting: { kind: "connecting" },
  offline: { kind: "offline" },
  failed: { kind: "failed" },
  busy: { kind: "busy", retryAfter: 420 },
};

/**
 * /dev/tv-connect — the wall's «Подключить экран» (D-182) on fixtures, without the API:
 * `?case=code|last|code-offline|loading|connecting|offline|failed|busy`, `?k=1.3` — the remote's
 * «Крупность». Dev only (app/dev/layout.tsx).
 */
export default async function TvConnectSandbox({ searchParams }: { searchParams: Promise<{ case?: string; k?: string }> }) {
  const { case: which = "code", k } = await searchParams;
  const view = CASES[which] ?? CASES.code;
  return (
    <div style={k ? ({ "--tv-k": k } as React.CSSProperties) : undefined}>
      <TvConnectView view={view} now={NOW} />
    </div>
  );
}
