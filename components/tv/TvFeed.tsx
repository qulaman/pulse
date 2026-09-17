"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { tvTime } from "@/lib/tv/clock";
import { lineOf, type TvEvent, type TvTone } from "@/lib/tv/feed";

/**
 * Левые 60% экрана: живая лента компании. Новое событие вплывает сверху и две секунды
 * держит золотую подсветку (CONCEPT §3.5); старое вытесняется снизу — длину ленты держит
 * запрос, DOM на стене не растёт (docs/FRONTEND.md «Appliance-чеклист»).
 * Анимации на ТВ медленнее телефонных: 400–600 мс.
 */

const HIGHLIGHT_MS = 2000;

const RAIL: Record<TvTone, string> = {
  accent: "var(--accent)",
  ok: "var(--ok)",
  gold: "var(--gold)",
  muted: "var(--border)",
};

/** Ленту подсвечивает только то, что пришло при нас: первая загрузка — не новость. */
function useFreshIds(ids: string[]): Set<string> {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const key = ids.join(",");

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const incoming = ids.filter((id) => !seen.current!.has(id));
    for (const id of ids) seen.current.add(id);
    if (incoming.length === 0) return;
    setFresh((prev) => new Set([...prev, ...incoming]));
    const timer = setTimeout(() => {
      setFresh((prev) => {
        const next = new Set(prev);
        for (const id of incoming) next.delete(id);
        return next;
      });
    }, HIGHLIGHT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids сравниваются по ключу, не по ссылке
  }, [key]);

  return fresh;
}

export function TvFeed({ events, guest }: { events: TvEvent[]; guest: boolean }) {
  const lines = events.map((event) => lineOf(event, guest));
  const fresh = useFreshIds(lines.map((line) => line.id));

  if (lines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[2.4vh] text-muted">
        Событий пока нет — экран оживёт с первым поручением
      </div>
    );
  }

  return (
    // строки делят колонку между собой, но выше 11vh карточка не растёт: на пустой
    // ленте экран не должен выглядеть растянутым
    <ul className="flex h-full flex-col gap-[1.1vh] overflow-hidden">
      <AnimatePresence initial={false}>
        {lines.map((line) => (
          <motion.li
            key={line.id}
            layout
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
            className="flex min-h-0 max-h-[11vh] flex-1 items-center gap-[1.6vh] overflow-hidden rounded-[1.4vh] border px-[1.8vh] py-[1.4vh]"
            style={{
              borderColor: fresh.has(line.id) ? "var(--gold)" : "var(--border)",
              background: fresh.has(line.id)
                ? "color-mix(in srgb, var(--gold) 12%, var(--surface))"
                : "var(--surface)",
              transition: "background 500ms var(--ease-out), border-color 500ms var(--ease-out)",
            }}
          >
            <span className="h-[4.6vh] w-[0.5vh] shrink-0 rounded-full" style={{ background: RAIL[line.tone] }} />

            <div className="min-w-0 flex-1">
              <p className="truncate text-[2.7vh] font-semibold leading-[3.2vh]">{line.name}</p>
              {line.detail ? (
                <p className="truncate text-[2.1vh] leading-[2.6vh] text-muted">{line.detail}</p>
              ) : null}
            </div>

            <span
              className="shrink-0 rounded-full px-[1.4vh] py-[0.5vh] text-[1.9vh] font-semibold leading-[2.4vh]"
              style={{
                color: RAIL[line.tone],
                background: `color-mix(in srgb, ${RAIL[line.tone]} 14%, transparent)`,
              }}
            >
              {line.label}
            </span>
            <span className="w-[7vh] shrink-0 text-right text-[1.9vh] leading-[2.4vh] text-muted tabular-nums">
              {tvTime(line.at)}
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
