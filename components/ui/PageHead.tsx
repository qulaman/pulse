"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { useTabRole } from "@/components/RoleScope";
import { backTarget } from "@/components/TabBar";
import { tabBarRole } from "@/lib/routes";
import type { Tone } from "@/lib/tasks/tone";
import { useMe } from "@/lib/tasks/queries";

type Back = { label: string; href?: string; onClick?: () => void; testId?: string };
type Light = "accent" | "ok" | "warn" | "danger" | "none";

const LIGHTS: Light[] = ["accent", "ok", "warn", "danger", "none"];

/** The state's colour lights the screen; «muted» and «gold» are not states of a screen. */
function lightOf(tone: Tone | undefined): Light {
  return tone === "accent" || tone === "ok" || tone === "warn" || tone === "danger" ? tone : "none";
}

// the server has no layout to measure: the fit waits for the browser
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The head of every screen that has a title — «свет состояния» (D-117) in the bar grammar of
 * D-113. The screen is lit from above by the colour of its state (`tone` — the one it already
 * computes for its status card) and the colour belongs to the state alone: «‹ Назад» and the
 * round `HeadButton`s are neutral glass.
 *
 *   ЧЕТВЕРГ, 24 СЕНТЯБРЯ                   (○)     ← a tab: no bar row at rest
 *   Задачи
 *   ● 3 ждут вашего решения                          ← `state`, in the tone's colour
 *
 * A nested screen keeps the bar row for «‹ Назад» (its own `back`, or one by itself on every
 * screen that is not a tab's root). Scrolled, the large title leaves with the finger and the
 * sky folds into a horizon — a tinted glass strip with the small title and the state's dot.
 * Opacity and transform only; `bare` — the bar alone (the task screen: its title lives in its
 * status screen). The client brand lives on the home screens (D-113 §4).
 */
export function PageHead({
  title,
  smallTitle,
  eyebrow,
  back,
  tone,
  state,
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
  /**
   * «‹ label» on the left of the bar, a link or a callback. Left out, every screen that is not
   * a tab's own root gets «‹ Назад» by itself (`useAutoBack`); `false` — none (a sheet-like
   * screen with its own «×»).
   */
  back?: Back | false;
  /** the screen's state: the colour of its light (D-117); none — a quiet neutral sky */
  tone?: Tone;
  /** the state in words, in its colour — only where no status card below says it */
  state?: ReactNode;
  /** one neutral line under the title (a position, a role) */
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
  const beside = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLElement>(null);
  const [glass, setGlass] = useState(false);
  const [titled, setTitled] = useState(false);

  const small = smallTitle ?? (typeof title === "string" ? title : undefined);
  const auto = useAutoBack(back === undefined);
  const way = back === false ? undefined : (back ?? auto);
  // a tab's root: no bar row at rest — the large title starts under the notch
  const compact = !bare && !way;
  const light = lightOf(tone);

  // the D-113 thresholds: the fallback where scroll timelines are missing, and the state
  // under reduced motion
  useEffect(() => {
    const barNode = bar.current;
    const marks = [edge.current, titleEnd.current];
    if (!barNode || !marks[0] || !marks[1]) return;
    let observer: IntersectionObserver | null = null;
    // the bar's height moves with the safe area (rotation): re-observe with the new margin
    const watch = () => {
      observer?.disconnect();
      const top = Math.round(barNode.getBoundingClientRect().height) - (compact ? 44 : 0);
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
    resize.observe(barNode);
    return () => {
      resize.disconnect();
      observer?.disconnect();
    };
  }, [compact]);

  // a tab's buttons stand in the title's row: the title keeps clear of them
  useIsoLayoutEffect(() => {
    const side = beside.current;
    const header = head.current;
    if (!header) return;
    if (!compact || !side) {
      header.style.removeProperty("--beside");
      return;
    }
    const measure = () => header.style.setProperty("--beside", `${Math.ceil(side.getBoundingClientRect().width) + 12}px`);
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(side);
    return () => resize.disconnect();
  }, [compact]);

  return (
    <>
      <div aria-hidden className="page-sky" data-tone={light}>
        {LIGHTS.map((key) => (
          <div key={key} className="page-sky-layer" data-tone={key} />
        ))}
        <div className="page-sky-grain" />
      </div>
      <div
        ref={bar}
        data-nav-bar=""
        className="nav-bar"
        data-tone={light}
        data-compact={compact ? "" : undefined}
        data-eyebrow={eyebrow ? "" : undefined}
        data-glass={glass ? "" : undefined}
        data-titled={titled ? "" : undefined}
      >
        <div aria-hidden className="nav-bar-glass" />
        <div className="nav-bar-row">
          <div className="nav-bar-side">{way ? <BackButton back={way} /> : null}</div>
          <div aria-hidden className="nav-bar-title">
            <span className="nav-bar-dot" />
            <span className="nav-bar-title-text">{small}</span>
          </div>
          <div className="nav-bar-side nav-bar-end">
            <div ref={beside} className="nav-bar-actions">
              {actions}
            </div>
          </div>
        </div>
      </div>
      {/* scrolled under the bar: the first page pixel — glass; the end of the title — the small title */}
      <div ref={edge} aria-hidden className="-mb-px h-px" />
      {bare ? null : (
        <header ref={head} className="page-head" data-tone={light} data-compact={compact ? "" : undefined}>
          {eyebrow ? (
            <div className="page-head-eyebrow">
              <span className="min-w-0 truncate">{eyebrow}</span>
            </div>
          ) : null}
          {heading ?? (typeof title === "string" ? <FitTitle>{title}</FitTitle> : <h1 className="page-head-title">{title}</h1>)}
          {state ? (
            <p className="page-head-state">
              <span aria-hidden className="page-head-dot" />
              <span className="min-w-0 truncate">{state}</span>
            </p>
          ) : null}
          {sub ? <p className="page-head-sub">{sub}</p> : null}
        </header>
      )}
      <div ref={titleEnd} aria-hidden className="h-px" />
    </>
  );
}

/**
 * A large title on one line: too long for the row, it shrinks (never below 26 px) and only
 * then wraps. Measured before paint; one line keeps the 40 px box, so nothing under it moves.
 */
function FitTitle({ children }: { children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    const room = el?.parentElement;
    if (!el || !room) return;
    const fit = () => {
      el.style.fontSize = "";
      el.removeAttribute("data-wrap");
      const natural = el.scrollWidth;
      const width = el.clientWidth;
      if (natural <= width) return;
      const px = Math.max(26, Math.floor((34 * width) / natural));
      el.style.fontSize = `${px}px`;
      if ((natural * px) / 34 > width) el.setAttribute("data-wrap", "");
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(room);
    return () => resize.disconnect();
  }, [children]);
  return (
    <h1 ref={ref} className="page-head-title" data-fit="">
      {children}
    </h1>
  );
}

/**
 * «‹ Назад» for a screen the tab bar has no tab for (D-113 §7): «Команда», «Магазин», «Данные»,
 * «Эфир», the director's «Рейтинг»… It goes back in the history when there is one inside the
 * app, otherwise (opened from a push) to the tab the screen lives in (`backTarget`). The role
 * comes from the layout (`RoleScope`), so the decision — and the layout of the head — is
 * there on the first paint; the profile is the fallback outside a layout.
 */
function useAutoBack(wanted: boolean): Back | undefined {
  const scoped = useTabRole();
  const me = useMe();
  const path = usePathname();
  const router = useRouter();
  const role = scoped ?? (me.data ? tabBarRole(me.data.role) : null);
  if (!wanted || !role) return undefined;
  const target = backTarget(role, path);
  if (!target) return undefined;
  return {
    label: "Назад",
    onClick: () => {
      if (window.history.length > 1) router.back();
      else router.push(target);
    },
  };
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
