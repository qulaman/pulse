import { KioskPause, KioskReconnect } from "@/components/tv/KioskLife";
import { WALL_WATCHDOG_SCRIPT } from "@/lib/tv/kiosk-signal";

/**
 * /dev/tv-kiosk?case=reconnect|error[&k=1.3] — the wall's own screens of D-182 without a kiosk:
 * «Переподключаюсь…» (the base did not answer the sign-in check) and the error screen. Pictures
 * only: the reconnect screen does not ask the server here. The watchdog script is inlined as on
 * the wall — off `/tv` it only proves it parses (`window.__pulseWallWatchdog`).
 */
export default async function TvKioskSandbox({ searchParams }: { searchParams: Promise<{ case?: string; k?: string }> }) {
  const { case: which = "reconnect", k } = await searchParams;
  const scale = k === "1.15" || k === "1.3" ? Number(k) : 1;
  return (
    <div className="h-dvh overflow-hidden bg-bg" style={{ cursor: "none", ["--tv-k" as string]: scale } as React.CSSProperties}>
      <script dangerouslySetInnerHTML={{ __html: WALL_WATCHDOG_SCRIPT }} />
      {which === "error" ? <KioskPause text="Обновляю экран…" /> : <KioskReconnect still />}
    </div>
  );
}
