"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

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
  const { shown, activeId, speaking } = useTypewriter(
    spoken.map((line) => ({ id: line.id, text: line.text, instant: line.instant })),
    replayKey,
  );

  const worst = spoken.find((line) => line.kind === "verdict")?.tone;
  const handledAll = spoken.every((line) => line.kind !== "fact" || isHandled(line, taskById));
  const mascot: MascotState = loading ? "thinking" : speaking ? "speaking" : worst && !handledAll ? "calm" : "happy";

  // a question and its answer land at the bottom: bring them into view, above the pinned button
  const last = spoken[spoken.length - 1];
  const lastId = last?.id;
  const lastIsChat = last?.kind === "director" || last?.kind === "answer";
  // each new line reserves its full height the moment it starts, so one scroll per line is enough
  useEffect(() => {
    if (!lastIsChat) return;
    const timer = setTimeout(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    }, 80);
    return () => clearTimeout(timer);
  }, [lastId, lastIsChat, activeId, speaking]);

  // an expanded fact scrolls to the top of the screen (under the sticky header),
  // so its cards are read at once instead of hiding under the pinned button
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-line="${CSS.escape(open)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => clearTimeout(timer);
  }, [open]);

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
        className="mx-auto flex h-[168px] w-[168px] items-center justify-center rounded-full transition-transform duration-[120ms] active:scale-[0.96]"
      >
        <Mascot state={mascot} size={144} />
      </button>

      <div className="mt-3 flex flex-col gap-3" aria-live="polite">
        {loading && spoken.length === 0 ? (
          <Bubble kind="greeting" text="Смотрю, что нового…" shownChars={17} active tone={undefined} />
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

          if (line.kind === "director") {
            return (
              <div key={line.id} className="card-in flex justify-end pt-2">
                <p className="max-w-[85%] rounded-[16px] rounded-tr-[6px] bg-surface-2 px-4 py-2 text-[16px] leading-[22px]">
                  {line.text}
                </p>
              </div>
            );
          }

          return (
            <div key={line.id} className="card-in scroll-mt-[76px]" data-line={line.id}>
              <Bubble
                kind={line.kind}
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
                <div className="mt-2 flex flex-col gap-2 pl-4">
                  {(line.taskIds ?? []).map((id) => {
                    const task = taskById.get(id);
                    if (!task) return null;
                    const extra = task as TaskWithPeople & { question?: string | null; decline_reason?: string | null };
                    return (
                      <TaskCard
                        key={id}
                        task={task}
                        variant="director"
                        actions={actions}
                        companyId={companyId}
                        href={`/tasks/${id}`}
                        question={extra.question ?? null}
                        declineReason={extra.decline_reason ?? null}
                      />
                    );
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
  kind,
  text,
  shownChars,
  active,
  tone,
  handled,
  href,
  onTap,
  expanded,
}: {
  kind: BriefLine["kind"];
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
  // every letter lands on its own (keyed by position, so the ones already said stay put)
  const letters = Array.from(visible).map((ch, i) => (
    <span key={i} className="ch">
      {ch}
    </span>
  ));
  const body = (
    <span className="relative block">
      <span aria-hidden className="invisible block">
        {text}
      </span>
      <span className={`absolute inset-0 block ${active ? "saying" : ""}`}>{letters}</span>
    </span>
  );
  // no frames: the assistant just talks — a tone dot on the left, a quiet mark on the right
  const size = kind === "greeting" ? "text-[19px] font-semibold leading-6" : "text-[17px] leading-6";
  const className = [
    "relative block w-full py-1 pl-4 pr-8 text-left",
    size,
    handled ? "opacity-50" : "",
    onTap || href ? "transition-transform duration-[120ms] active:scale-[0.99]" : "",
  ].join(" ");
  const dot = tone ? (
    <span
      aria-hidden
      className="absolute left-0 top-[11px] h-2 w-2 rounded-full"
      style={{ background: TONE_COLOR[tone] }}
    />
  ) : null;
  const mark = handled ? "✓" : onTap ? (expanded ? "▴" : "▾") : href ? "›" : null;
  const tail = mark ? (
    <span aria-hidden className="absolute right-1 top-1 text-[14px] leading-6 text-muted">
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
