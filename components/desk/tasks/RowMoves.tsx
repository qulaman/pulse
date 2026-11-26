"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";

import { Menu, type MenuItem } from "@/components/desk/ui/Menu";
import { toast } from "@/components/ui/Toast";
import { KEY_CAP, type Move } from "@/lib/desk/tasks";
import { usePhones } from "@/lib/people/card-queries";
import { usePushHealth } from "@/lib/push/health-query";
import { noPushIds } from "@/lib/tasks/attention";

/**
 * A small button of the desk's lists (D-154), its letter inside — «Принять A». `main` — the
 * director's own move: a word in the pen with a hairline (D-158); `filled` — the closing move of
 * the task in hand (the panel, the stack), the screen's single filled button. The rest are words.
 */
export function MiniButton({
  label,
  main = false,
  filled = false,
  keyCap,
  title,
  onPress,
  disabled = false,
  size = "sm",
  testId,
}: {
  label: string;
  main?: boolean;
  filled?: boolean;
  keyCap?: string;
  title?: string;
  onPress: (target: HTMLElement) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  testId?: string;
}) {
  // a card's buttons have room around their words: they read as buttons, not one strip (D-203)
  const height = size === "md" ? `h-9 text-[14px] ${filled || main ? "px-3.5" : "px-3"}` : "h-7 px-2 text-[13px]";
  const look = filled ? "btn-primary border-transparent" : main ? "desk-move" : "border-transparent font-medium text-text hover:bg-surface-2";
  return (
    <button
      type="button"
      title={title ?? (keyCap ? `${label} · ${keyCap}` : undefined)}
      data-testid={testId}
      disabled={disabled}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        // a row's click opens its panel; the button is the button only
        event.stopPropagation();
        onPress(event.currentTarget);
      }}
      // `desk-mini`: «Графит» gives the plain word a body (D-171). The letter is in the title only: keys
      // live in the «?» sheet and a button's tooltip, never printed on the button (owner, 2026-11-25)
      className={`desk-mini inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[2px] border leading-4 transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 ${height} ${look}`}
    >
      {label}
    </button>
  );
}

/**
 * One move of a row or a card: the phone's action under a short word with its letter. A reminder
 * sent within the half hour is said, not offered («Напомнили 11:50»). `showKey` — the letter is
 * shown (the row under the cursor); without it the hint keeps it.
 */
export function MoveButton({
  move,
  onPress,
  size = "sm",
  showKey = true,
  fill = false,
}: {
  move: Move;
  onPress: (move: Move, target: HTMLElement) => void;
  size?: "sm" | "md";
  showKey?: boolean;
  /** the main move is the card's one filled button (the stack of «Разобрать») */
  fill?: boolean;
}) {
  if (move.held) {
    const height = size === "md" ? "h-9 px-1 text-[14px]" : "h-7 px-1 text-[13px]";
    return (
      <span className={`inline-flex shrink-0 items-center whitespace-nowrap text-muted ${height}`} title={move.title} data-testid={`move-${move.action}`}>
        {move.label}
      </span>
    );
  }
  const cap = move.key ? KEY_CAP[move.key] : undefined;
  return (
    <MiniButton
      label={move.label}
      main={move.main}
      filled={fill && move.main}
      keyCap={showKey ? cap : undefined}
      title={move.title ?? (cap ? `${move.label} · ${cap}` : undefined)}
      onPress={(target) => onPress(move, target)}
      size={size}
      testId={`move-${move.action}`}
    />
  );
}

/** The moves of one task in a row, the reason's own first. */
export function MoveRow({
  moves,
  onPress,
  size = "sm",
  className = "",
  showKeys = true,
  fillMain = false,
}: {
  moves: readonly Move[];
  onPress: (move: Move, target: HTMLElement) => void;
  size?: "sm" | "md";
  className?: string;
  showKeys?: boolean;
  fillMain?: boolean;
}) {
  if (moves.length === 0) return null;
  return (
    <span className={`flex items-center gap-1 ${className}`} data-testid="desk-moves">
      {moves.map((move) => (
        <MoveButton key={move.action} move={move} onPress={onPress} size={size} showKey={showKeys} fill={fillMain} />
      ))}
    </span>
  );
}

/** A row's quiet word: the answer written on this task has not been sent yet. */
export function DraftMark() {
  return (
    <span className="shrink-0 text-[12px] leading-4 text-muted" title="Ответ написан, но не отправлен" data-testid="desk-draft-mark">
      черновик
    </span>
  );
}

/**
 * «⋯» — every move the task allows, as the desk's menu under the button (the same list as a right
 * click). `taskId` — «.» finds it (`openMoreOf`).
 */
export function MoreButton({ items, taskId, testId = "desk-row-more", label = "Все действия" }: { items: () => MenuItem[]; taskId?: string; testId?: string; label?: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={`${label} · правый клик по строке`}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        data-testid={testId}
        data-desk-more={taskId}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(anchor ? null : event.currentTarget);
        }}
        className="-my-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5.5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="18.5" cy="12" r="1.7" />
        </svg>
      </button>
      {anchor ? <Menu open onClose={() => setAnchor(null)} anchor={anchor} items={items()} align="end" width={280} label={label} /> : null}
    </>
  );
}

/**
 * Whose pushes do not reach and their phones (lib/tasks/reasons.ts `firstMoveOf`): a task of such a
 * person puts «Позвонить» first instead of «Напомнить» (owner, 2026-11-25). The phones are the
 * director's read of `profile_phones`; unknown — `blind`, «Напомнить» with an honest hint.
 */
export function useCallFirst(): { noPush: ReadonlySet<string>; phoneOf: (id: string) => string | null } {
  const health = usePushHealth();
  const phones = usePhones();
  const noPush = useMemo(() => noPushIds(health.data), [health.data]);
  return { noPush, phoneOf: (id: string) => phones.data?.[id] ?? null };
}

/** The number into the clipboard, said in a toast; a closed clipboard still shows the number. */
export async function copyPhone(tel: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(tel);
    toast(`Номер скопирован: ${tel}`);
    return true;
  } catch {
    // the clipboard closed (a page without focus, an old browser): the number is in the words
    toast(`Номер: ${tel}`);
    return false;
  }
}

/**
 * «Позвонить» on the computer: no `tel:` here (D-175, as the alarm's guard number) — the number
 * stands in the button and a click copies it for the phone in the hand.
 */
export function CallButton({ tel, size = "sm", testId }: { tel: string; size?: "sm" | "md"; testId?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    if (await copyPhone(tel)) setCopied(true);
  };
  return (
    <MiniButton
      label={copied ? "Скопировано" : `Позвонить · ${tel}`}
      size={size}
      main
      title={`Уведомления до исполнителя не доходят — позвоните. Клик скопирует номер ${tel}`}
      onPress={() => void copy()}
      testId={testId}
    />
  );
}
