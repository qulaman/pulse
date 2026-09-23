import type { TaskStatus } from "@/lib/tasks/status-text";
import { TONE_VAR, type Tone } from "@/lib/tasks/tone";

/**
 * The state of a task as one small mark at the head of its card — a ring that fills as
 * the work moves: empty when handed out, half in work, three quarters on review, a solid
 * disc when accepted. A refusal is a crossed disc, a recall a struck-through ring, «позже»
 * a dashed one. Red whenever the deadline has passed. Read at a glance, before any word.
 */

const FILL: Partial<Record<TaskStatus, number>> = {
  sent: 0,
  accepted: 0.5,
  in_progress: 0.5,
  rework: 0.25,
  pending_review: 0.75,
};

const TONE: Record<TaskStatus, Tone> = {
  scheduled: "muted",
  sent: "accent",
  accepted: "ok",
  in_progress: "ok",
  rework: "warn",
  pending_review: "warn",
  done: "gold",
  declined: "danger",
  revoked: "muted",
};

const PIE_R = 3.4;
const PIE_C = 2 * Math.PI * PIE_R;

export function statusToneOf(status: TaskStatus, overdue: boolean): Tone {
  return overdue ? "danger" : TONE[status];
}

export function StatusGlyph({ status, overdue = false, size = 22 }: { status: TaskStatus; overdue?: boolean; size?: number }) {
  const color = TONE_VAR[statusToneOf(status, overdue)];

  if (status === "done" || status === "declined") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
        <circle cx="12" cy="12" r="10" fill={color} />
        {status === "done" ? (
          <path d="M7.5 12.4l3 3 6-6.4" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" />
        )}
      </svg>
    );
  }

  const fill = FILL[status] ?? 0;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={status === "scheduled" ? "2.6 3.05" : undefined}
      />
      {fill > 0 ? (
        <circle
          cx="12"
          cy="12"
          r={PIE_R}
          fill="none"
          stroke={color}
          strokeWidth={PIE_R * 2}
          strokeDasharray={`${PIE_C * fill} ${PIE_C}`}
          transform="rotate(-90 12 12)"
        />
      ) : null}
      {status === "revoked" ? <path d="M6.5 17.5l11-11" stroke={color} strokeWidth="2" strokeLinecap="round" /> : null}
      {status === "sent" && !overdue ? <circle cx="12" cy="12" r="2.2" fill={color} opacity="0.55" /> : null}
    </svg>
  );
}
