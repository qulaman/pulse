"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

import { useSectionSpy } from "@/components/desk/ui/useSectionSpy";

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

const GLIDE = { type: "spring", stiffness: 520, damping: 42, mass: 0.8 } as const;

/**
 * The page's own contents on the left (D-174): a click brings the section up, the plate glides to
 * the section being read as the page scrolls.
 */
export function ProfileNav({ sections }: { sections: ProfileSection[] }) {
  const current = useSectionSpy(sections.map((section) => section.id), 120);
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
              node?.scrollIntoView({ block: "start", behavior: "smooth" });
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
