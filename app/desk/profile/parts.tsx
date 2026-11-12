"use client";

import { motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

/**
 * A card of the account page (D-174), the way settings read on Vercel: a title and what it is for,
 * the control or the rows under them, and a foot — a quiet note on the left, the card's action on
 * the right. `tone="danger"` — a card whose move ends something.
 */
export function ProfileCard({
  id,
  title,
  description,
  children,
  note,
  actions,
  tone,
  testId,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
  tone?: "danger";
  testId?: string;
}) {
  return (
    <section id={id} className="profile-card" data-tone={tone} data-testid={testId} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="profile-card-body">
        <div className="profile-card-head">
          <h2 id={id ? `${id}-title` : undefined} className="profile-card-title">
            {title}
          </h2>
          {description ? <p className="profile-card-text">{description}</p> : null}
        </div>
        {children}
      </div>
      {note || actions ? (
        <div className="profile-card-foot">
          <div className="profile-card-note">{note}</div>
          {actions ? <div className="profile-card-actions">{actions}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

/** One setting in a card: what it is and what it does on the left, its control on the right; `below` — what opens under it. */
export function ProfileRow({ label, hint, children, below, testId }: { label: ReactNode; hint?: ReactNode; children?: ReactNode; below?: ReactNode; testId?: string }) {
  return (
    <div className="profile-row" data-testid={testId}>
      <div className="profile-row-line">
        <div className="min-w-0 flex-1">
          <div className="profile-row-label">{label}</div>
          {hint ? <div className="profile-row-hint">{hint}</div> : null}
        </div>
        {children ? <div className="profile-row-control">{children}</div> : null}
      </div>
      {below ? <div className="profile-row-below">{below}</div> : null}
    </div>
  );
}

/** A state in a word with its dot: «Включены» green, «Запрещены» red, the rest quiet. */
export function StateBadge({ tone, children }: { tone: "ok" | "danger" | "muted"; children: ReactNode }) {
  return (
    <span className="profile-badge" data-tone={tone}>
      <span className="profile-badge-dot" aria-hidden />
      {children}
    </span>
  );
}

export type ProfileSection = { id: string; label: string };

/** The section that sits under the top of the window now — the nearest heading above its middle. */
function useSpy(ids: readonly string[]): string | null {
  const [current, setCurrent] = useState<string | null>(ids[0] ?? null);
  const key = ids.join("|");
  useEffect(() => {
    const list = key.split("|").filter(Boolean);
    const scroller = document.getElementById("desk-main");
    if (!scroller || list.length === 0) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const top = scroller.getBoundingClientRect().top + 120;
      let found = list[0];
      for (const id of list) {
        const node = document.getElementById(id);
        if (node && node.getBoundingClientRect().top <= top) found = id;
      }
      // at the very bottom the last section is the one being read, however short
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) found = list[list.length - 1];
      setCurrent(found);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [key]);
  return current;
}

const GLIDE = { type: "spring", stiffness: 520, damping: 42, mass: 0.8 } as const;

/**
 * The page's own contents on the left (D-174): a click brings the section up, the plate glides to
 * the section being read as the page scrolls.
 */
export function ProfileNav({ sections }: { sections: ProfileSection[] }) {
  const current = useSpy(sections.map((section) => section.id));
  return (
    <nav className="profile-nav" aria-label="Оглавление профиля">
      {sections.map((section) => {
        const on = section.id === current;
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="profile-nav-link"
            aria-current={on ? "location" : undefined}
            onClick={(event) => {
              event.preventDefault();
              const node = document.getElementById(section.id);
              const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              node?.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
            }}
          >
            {on ? <motion.span layoutId="profile-nav-plate" className="profile-nav-plate" transition={GLIDE} aria-hidden /> : null}
            <span className="relative">{section.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
