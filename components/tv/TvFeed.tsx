"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { initialsOf } from "@/lib/idle/people";
import { tvTime } from "@/lib/tv/clock";
import { lineOf, type TvEvent, type TvLine, type TvTone } from "@/lib/tv/feed";

import { TvSpark } from "./TvSpark";

/**
 * Левые 60% экрана: живая лента компании. Самое свежее — героем: крупная карточка с
 * инициалами человека, которую видно с порога; остальное — строками под ней. Новое
 * вплывает сверху и две секунды держит золотую подсветку (CONCEPT §3.5), старое
 * вытесняется снизу — длину ленты держит запрос, DOM на стене не растёт.
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

function Label({ line, big }: { line: TvLine; big?: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full font-semibold ${big ? "px-[1.8vh] py-[0.7vh] text-[2.3vh] leading-[2.9vh]" : "px-[1.4vh] py-[0.5vh] text-[1.9vh] leading-[2.4vh]"}`}
      style={{ color: RAIL[line.tone], background: `color-mix(in srgb, ${RAIL[line.tone]} 14%, transparent)` }}
    >
      {line.label}
    </span>
  );
}

/** Герой ленты: то, что происходит прямо сейчас, читается от двери. */
function Hero({ line, fresh }: { line: TvLine; fresh: boolean }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -28 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
      className="relative flex min-h-0 shrink-0 items-center gap-[2vh] overflow-hidden rounded-[1.6vh] border px-[2.2vh] py-[1.8vh]"
      style={{
        borderColor: fresh ? "var(--gold)" : "var(--border)",
        background: fresh
          ? `color-mix(in srgb, var(--gold) 12%, var(--surface))`
          : `linear-gradient(90deg, color-mix(in srgb, ${RAIL[line.tone]} 10%, var(--surface)), var(--surface) 55%)`,
        transition: "background 500ms var(--ease-out), border-color 500ms var(--ease-out)",
      }}
    >
      <span
        className="flex h-[8vh] w-[8vh] shrink-0 items-center justify-center rounded-full text-[2.8vh] font-semibold"
        style={{ color: RAIL[line.tone], background: `color-mix(in srgb, ${RAIL[line.tone]} 16%, transparent)` }}
      >
        {initialsOf(line.name)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[3.4vh] font-semibold leading-[4vh]">{line.name}</p>
        {line.detail ? <p className="truncate text-[2.5vh] leading-[3.1vh] text-muted">{line.detail}</p> : null}
      </div>

      <Label line={line} big />
      <span className="w-[8vh] shrink-0 text-right text-[2.2vh] leading-[2.8vh] text-muted tabular-nums">
        {tvTime(line.at)}
      </span>

      {fresh ? <TvSpark tone={line.tone} /> : null}
    </motion.li>
  );
}

function Row({ line, fresh }: { line: TvLine; fresh: boolean }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
      className="flex min-h-0 max-h-[10vh] flex-1 items-center gap-[1.6vh] overflow-hidden rounded-[1.4vh] border px-[1.8vh] py-[1.2vh]"
      style={{
        borderColor: fresh ? "var(--gold)" : "var(--border)",
        background: fresh ? "color-mix(in srgb, var(--gold) 12%, var(--surface))" : "var(--surface)",
        transition: "background 500ms var(--ease-out), border-color 500ms var(--ease-out)",
      }}
    >
      <span className="h-[4.2vh] w-[0.5vh] shrink-0 rounded-full" style={{ background: RAIL[line.tone] }} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[2.5vh] font-semibold leading-[3vh]">{line.name}</p>
        {line.detail ? <p className="truncate text-[2vh] leading-[2.5vh] text-muted">{line.detail}</p> : null}
      </div>

      <Label line={line} />
      <span className="w-[7vh] shrink-0 text-right text-[1.9vh] leading-[2.4vh] text-muted tabular-nums">
        {tvTime(line.at)}
      </span>
    </motion.li>
  );
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

  const [hero, ...rest] = lines;

  return (
    <ul className="flex h-full flex-col gap-[1.1vh] overflow-hidden">
      <AnimatePresence initial={false}>
        {hero ? <Hero key={hero.id} line={hero} fresh={fresh.has(hero.id)} /> : null}
        {rest.map((line) => (
          <Row key={line.id} line={line} fresh={fresh.has(line.id)} />
        ))}
      </AnimatePresence>
    </ul>
  );
}
