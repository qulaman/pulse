"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Mascot, type MascotState } from "@/components/brand/Mascot";
import { TaskCard } from "@/components/tasks/TaskCard";
import type { BriefLine, BriefTone } from "@/lib/pulse/briefing";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { useTypewriter } from "./useTypewriter";

const TONE_COLOR: Record<BriefTone, string> = {
  danger: "var(--danger)",
  warn: "var(--warn)",
  ok: "var(--ok)",
  muted: "var(--text-muted)",
};

/**
 * The briefing said out loud: the lines the assistant talks through are already
 * known, so a snapshot of the conversation stays on screen — a handled fact fades
 * and gets a check, it is never unsaid. New facts (Realtime) join the end.
 */
export function mergeLines(snapshot: BriefLine[], fresh: BriefLine[]): BriefLine[] {
  if (snapshot.length === 0) return fresh;
  let changed = false;
  const byId = new Map(fresh.map((line) => [line.id, line]));
  const next = snapshot.map((line) => {
    const update = byId.get(line.id);
    if (!update) return line;
    if (update.text === line.text && sameIds(update.taskIds, line.taskIds)) return line;
    changed = true;
    return update;
  });
  const known = new Set(snapshot.map((line) => line.id));
  for (const line of fresh) {
    if (known.has(line.id)) continue;
    // the quiet line has nothing to add once facts were spoken, and vice versa
    if (line.kind === "quiet" || line.kind === "greeting") continue;
    next.push(line);
    changed = true;
  }
  return changed ? next : snapshot;
}

function sameIds(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

type Props = {
  /** Fresh lines from the data; the component keeps its own spoken snapshot. */
  lines: BriefLine[];
  loading: boolean;
  /** Tasks the director can act on, by id — a fact bubble opens their cards inline. */
  taskById: Map<string, TaskWithPeople>;
  actions: TaskActions;
  companyId: string;
  /** Service bubbles (push, draft) — said after the briefing, so nothing above them ever moves. */
  children?: ReactNode;
};

export function Assistant({ lines, loading, taskById, actions, companyId, children }: Props) {
  const [spoken, setSpoken] = useState<BriefLine[]>([]);
  const merged = loading ? spoken : mergeLines(spoken, lines);
  if (merged !== spoken) setSpoken(merged);

  const [replayKey, setReplayKey] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const { shown, activeId, speaking } = useTypewriter(spoken, replayKey);

  const worst = spoken.find((line) => line.kind === "verdict")?.tone;
  const handledAll = spoken.every((line) => line.kind !== "fact" || isHandled(line, taskById));
  const mascot: MascotState = loading ? "thinking" : speaking ? "calm" : worst && !handledAll ? "calm" : "happy";

  const replay = () => {
    setOpen(null);
    setReplayKey((key) => key + 1);
  };

  return (
    <section aria-label="Ассистент" className="flex flex-col items-stretch">
      <button
        type="button"
        onClick={replay}
        aria-label="Повторить доклад"
        className="mx-auto flex h-[120px] w-[120px] items-center justify-center rounded-full transition-transform duration-[120ms] active:scale-[0.96]"
      >
        <Mascot state={mascot} size={96} />
      </button>

      <div className="mt-2 flex flex-col gap-2" aria-live="polite">
        {loading && spoken.length === 0 ? (
          <Bubble text="Смотрю, что нового…" shownChars={17} active tone={undefined} />
        ) : null}

        {spoken.map((line) => {
          const chars = shown[line.id] ?? 0;
          if (chars === 0 && activeId !== line.id) return null; // not said yet
          const handled = line.kind === "fact" && isHandled(line, taskById);
          const expandable = line.kind === "fact" && !handled && (line.taskIds ?? []).some((id) => taskById.has(id));
          const link =
            line.kind === "more"
              ? "/sent"
              : line.kind === "fact" && !expandable && line.taskIds?.length === 1
                ? `/tasks/${line.taskIds[0]}`
                : null;
          const expanded = open === line.id;

          return (
            <div key={line.id} className="card-in">
              <Bubble
                text={line.text}
                shownChars={chars}
                active={activeId === line.id}
                tone={line.tone}
                handled={handled}
                href={link}
                onTap={expandable ? () => setOpen(expanded ? null : line.id) : undefined}
                expanded={expanded}
              />
              {expanded ? (
                <div className="mt-2 flex flex-col gap-2 pl-3">
                  {(line.taskIds ?? []).map((id) => {
                    const task = taskById.get(id);
                    return task ? (
                      <TaskCard key={id} task={task} variant="director" actions={actions} companyId={companyId} href={`/tasks/${id}`} />
                    ) : null;
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        {!loading && !speaking ? children : null}
      </div>
    </section>
  );
}

function isHandled(line: BriefLine, taskById: Map<string, TaskWithPeople>): boolean {
  const ids = line.taskIds ?? [];
  if (ids.length === 0) return false;
  if (line.tone === "muted") return false; // news never needs handling
  return ids.every((id) => !taskById.has(id));
}

/**
 * One line of the assistant. The full text is laid out invisibly so the bubble has
 * its final height from the first frame; the letters said so far are painted on top.
 */
function Bubble({
  text,
  shownChars,
  active,
  tone,
  handled,
  href,
  onTap,
  expanded,
}: {
  text: string;
  shownChars: number;
  active: boolean;
  tone: BriefTone | undefined;
  handled?: boolean;
  href?: string | null;
  onTap?: () => void;
  expanded?: boolean;
}) {
  const visible = text.slice(0, shownChars);
  const body = (
    <span className="relative block">
      <span aria-hidden className="invisible block">
        {text}
      </span>
      <span className={`absolute inset-0 block ${active ? "saying" : ""}`}>{visible}</span>
    </span>
  );
  const className = [
    "relative block w-full rounded-[16px] rounded-tl-[6px] border border-border bg-surface py-3 pl-4 pr-9 text-left text-[16px] leading-[22px]",
    handled ? "opacity-55" : "",
    onTap || href ? "transition-transform duration-[120ms] active:scale-[0.99]" : "",
  ].join(" ");
  const dot = tone ? (
    <span
      aria-hidden
      className="absolute left-0 top-[16px] h-2 w-2 -translate-x-1/2 rounded-full border-2 border-bg"
      style={{ background: TONE_COLOR[tone] }}
    />
  ) : null;
  const mark = handled ? "✓" : onTap ? (expanded ? "▴" : "▾") : href ? "›" : null;
  const tail = mark ? (
    <span aria-hidden className="absolute right-3 top-3 text-[14px] leading-[22px] text-muted">
      {mark}
    </span>
  ) : null;

  if (onTap) {
    return (
      <button type="button" onClick={onTap} aria-expanded={expanded} className={className}>
        {dot}
        {body}
        {tail}
      </button>
    );
  }
  if (href) {
    return (
      <Link href={href} className={className}>
        {dot}
        {body}
        {tail}
      </Link>
    );
  }
  return (
    <div className={className}>
      {dot}
      {body}
      {tail}
    </div>
  );
}
