"use client";

import { useEffect, useState } from "react";

import { msUntilNightReload } from "@/lib/tv/clock";

/**
 * Appliance-часть киоска (docs/FRONTEND.md «ТВ-режим»): экран работает месяцами без рук.
 *  - ночной перезапуск в 04:00 Asia/Aqtobe — свежий деплой и сброс утечек;
 *  - честный индикатор «оффлайн»: сеть пропала ИЛИ сводка перестала обновляться.
 */

/** Сводка тянется раз в минуту; три промаха подряд — экран уже показывает прошлое. */
const STALE_MS = 3 * 60_000;

export function useNightReload(): void {
  useEffect(() => {
    const timer = setTimeout(() => window.location.reload(), msUntilNightReload());
    return () => clearTimeout(timer);
  }, []);
}

/**
 * «Оффлайн» в углу: либо браузер сам знает, что сети нет, либо последняя удачная
 * загрузка сводки старше трёх минут. Никогда не врёт «всё хорошо» на замерзшем экране.
 */
export function useOffline(lastUpdatedAt: number): boolean {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const check = () => {
      const stale = lastUpdatedAt > 0 && Date.now() - lastUpdatedAt > STALE_MS;
      setOffline(!navigator.onLine || stale);
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
