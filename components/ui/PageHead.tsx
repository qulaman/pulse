"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

type Back = { label: string; href?: string; onClick?: () => void; testId?: string };

/**
 * The head of every screen that has a title (D-113, iOS grammar): a navigation bar on top —
 * «‹ Назад» in the accent on the left, round glass buttons (`HeadButton`) on the right — and
 * the large title under it with an optional eyebrow (the date on the screens of the day) and
 * one live line (a summary, never an explanation).
 *
 *   ‹ Команда                            (○)(○)
 *   ЧЕТВЕРГ, 24 СЕНТЯБРЯ
 *   Задачи
 *
 * The bar sticks to the top. Clear at the top of the page; as soon as anything scrolls under
 * it, it turns to glass (iOS «scroll edge»); once the large title has gone under it, the
 * small title fades in — opacity and transform only. `bare` — the bar alone (the task screen: its title lives in the status
 * screen). The client brand is not here: it lives on the home screens (D-113 §4).
 */
export function PageHead({
  title,
  smallTitle,
  eyebrow,
  back,
  sub,
  actions,
  heading,
  bare = false,
}: {
  title?: ReactNode;
  /** the bar's title once the large one is gone; defaults to `title` when it is text */
  smallTitle?: string;
  /** the line above the large title: the date on the screens of the day */
  eyebrow?: ReactNode;
  /** a nested screen: «‹ label» on the left of the bar, a link or a callback */
  back?: Back;
  /** one live line under the title (a summary) */
  sub?: ReactNode;
  /** round `HeadButton`s on the right of the bar */
  actions?: ReactNode;
  /** replaces the large <h1> (an editable title renders its own) */
  heading?: ReactNode;
  /** the bar only, no large title */
  bare?: boolean;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const edge = useRef<HTMLDivElement>(null);
  const titleEnd = useRef<HTMLDivElement>(null);
  const [glass, setGlass] = useState(false);
  const [titled, setTitled] = useState(false);

  useEffect(() => {
    const head = bar.current;
    const marks = [edge.current, titleEnd.current];
    if (!head || !marks[0] || !marks[1]) return;
    let observer: IntersectionObserver | null = null;
    // the bar's height moves with the safe area (rotation): re-observe with the new margin
    const watch = () => {
      observer?.disconnect();
      const top = Math.round(head.getBoundingClientRect().height);
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const under = !entry.isIntersecting && entry.boundingClientRect.top < top + 1;
            if (entry.target === marks[0]) setGlass(under);
            else setTitled(under);
          }
        },
        { rootMargin: `-${top}px 0px 0px 0px` },
      );
      for (const mark of marks) if (mark) observer.observe(mark);
    };
    watch();
    const resize = new ResizeObserver(watch);
    resize.observe(head);
    return () => {
      resize.disconnect();
      observer?.disconnect();
    };
  }, []);

  const small = smallTitle ?? (typeof title === "string" ? title : undefined);

  return (
    <>
      <div ref={bar} data-nav-bar="" data-glass={glass ? "" : undefined} data-titled={titled ? "" : undefined} className="nav-bar">
        <div aria-hidden className="nav-bar-glass nav-glass" />
        <div className="nav-bar-row">
          <div className="nav-bar-side">{back ? <BackButton back={back} /> : null}</div>
          <div aria-hidden className="nav-bar-title">
            {small}
          </div>
          <div className="nav-bar-side nav-bar-end">{actions}</div>
        </div>
      </div>
      {/* scrolled under the bar: the first page pixel — glass; the end of the title — the small title */}
      <div ref={edge} aria-hidden className="h-px -mb-px" />
      {bare ? null : (
        <header className="page-head">
          {eyebrow ? (
            <div className="page-head-eyebrow">
              <span className="min-w-0 truncate">{eyebrow}</span>
            </div>
          ) : null}
          {heading ?? <h1 className="page-head-title">{title}</h1>}
          {sub ? <p className="page-head-sub">{sub}</p> : null}
        </header>
      )}
      <div ref={titleEnd} aria-hidden className="h-px" />
    </>
  );
}

function BackButton({ back }: { back: Back }) {
  const body = (
    <>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
        <path d="M14.5 5.5 8 12l6.5 6.5" />
      </svg>
      <span className="nav-back-label min-w-0 truncate">{back.label}</span>
    </>
  );
  if (back.href) {
    return (
      <Link href={back.href} className="nav-back" data-testid={back.testId}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={back.onClick} className="nav-back" data-testid={back.testId}>
      {body}
    </button>
  );
}
