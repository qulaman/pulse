"use client";

import { useEffect, useRef, useState } from "react";

import { msUntilNightReload } from "@/lib/tv/clock";
import { offlineNow, reloadAllowed } from "@/lib/tv/kiosk-signal";
import type { TvState } from "@/lib/tv/queries";
import { shouldReload } from "@/lib/tv/state";

/**
 * Appliance-часть киоска (docs/FRONTEND.md «ТВ-режим», D-182): экран работает месяцами без рук.
 *  - ночной перезапуск в 04:00 Asia/Aqtobe — свежий деплой и сброс утечек, только к живому серверу;
 *  - честный индикатор «оффлайн»: сеть пропала, сводка перестала обновляться или так и не пришла.
 * Жизнь киоска целиком — `components/tv/KioskLife.tsx`.
 */

/** A night reload the server did not answer for: asked again this much later. */
const NIGHT_RETRY_MS = 5 * 60_000;
/** «Перезапустить экран» from the remote while the server does not answer: asked again this much later. */
const REMOTE_RETRY_MS = 30_000;
/** One question to the server is not waited on longer than this. */
const PROBE_TIMEOUT_MS = 10_000;

/** `/api/me` status, 0 — no answer. */
export async function probeServer(): Promise<number> {
  try {
    const res = await fetch("/api/me", { cache: "no-store", credentials: "include", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return res.status;
  } catch {
    return 0;
  }
}

/**
 * Reload — but only into a server that answers (D-182): a blind reload into a dead deployment
 * leaves the wall on the browser's error page, with no script left to bring it back. Asks
 * `/api/me`; 2xx — reload, otherwise again `retryMs` later. Returns the cancel.
 */
export function reloadWhenServerUp(retryMs: number): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attempt = async () => {
    const status = await probeServer();
    if (stopped) return;
    if (reloadAllowed(status)) window.location.reload();
    else timer = setTimeout(() => void attempt(), retryMs);
  };
  void attempt();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** 04:00 by Aqtobe: a fresh build and no leaks — whatever is on the wall at that hour. */
export function useNightReload(): void {
  useEffect(() => {
    let cancel: (() => void) | null = null;
    const timer = setTimeout(() => {
      cancel = reloadWhenServerUp(NIGHT_RETRY_MS);
    }, msUntilNightReload());
    return () => {
      clearTimeout(timer);
      cancel?.();
    };
  }, []);
}

/**
 * «Оффлайн» в углу: браузер сам знает, что сети нет; последняя удачная загрузка сводки старше
 * трёх минут; или за две минуты работы сводка не пришла ни разу. Никогда не врёт «всё хорошо»
 * на замёрзшем экране.
 */
export function useOffline(lastUpdatedAt: number): boolean {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // the effect starts again only when data comes, so before the first data this is the wall's start
    const bootAt = Date.now();
    const check = () => {
      setOffline(offlineNow({ online: navigator.onLine, lastDataAt: lastUpdatedAt || null, bootAt, now: Date.now() }));
    };
    check();
    const timer = setInterval(check, 15_000);
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
    };
  }, [lastUpdatedAt]);

  return offline;
}

/** Часы в шапке экрана: тикают раз в 10 секунд, минута на стене не должна опаздывать. */
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * Размер в пикселях для того, что рисуется числом, а не CSS: маскот принимает `size`
 * в px, а стена бывает и 720p, и 4K. Ноль до первого измерения — компонент подождёт.
 */
export function useVhPx(vh: number): number {
  const [px, setPx] = useState(0);
  useEffect(() => {
    const measure = () => setPx(Math.round((window.innerHeight * vh) / 100));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [vh]);
  return px;
}

/**
 * Перезапуск с пульта: «Перезапустить экран» ставит отметку в строке, киоск видит её
 * через Realtime и перезагружается сам — к отвечающему серверу. Сравниваем с временем
 * загрузки страницы, иначе поднявшийся киоск увидел бы ту же отметку и ушёл в петлю.
 */
export function useRemoteReload(state: TvState | null): void {
  const bootedAt = useRef(new Date());
  useEffect(() => {
    if (!shouldReload(state, bootedAt.current)) return;
    return reloadWhenServerUp(REMOTE_RETRY_MS);
  }, [state]);
}
