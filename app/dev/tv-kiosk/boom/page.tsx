"use client";

import { useEffect, useState } from "react";

/**
 * /dev/tv-kiosk/boom[?heal=N] — a scene that throws, under the wall's own error screen: it retries
 * every 10 s and reloads after three failures (D-182). `heal=N` — the N-th mount renders.
 */
let mounts = 0;

export default function Boom() {
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    mounts += 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the sandbox throws after mount on purpose
    setAttempt(mounts);
  }, []);
  const heal = Number(new URLSearchParams(typeof location === "undefined" ? "" : location.search).get("heal") ?? 0);
  if (attempt > 0 && (heal === 0 || attempt < heal)) throw new Error(`boom ${attempt}`);
  return (
    <p className="tv-lead p-[4vh] text-text" data-testid="boom-ok">
      {attempt > 0 ? `Сцена на месте, попытка ${attempt}` : "…"}
    </p>
  );
}
