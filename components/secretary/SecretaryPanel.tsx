"use client";

import { useRef, useState, type CSSProperties } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { askSecretary, usePendingErrands } from "@/lib/errands/pending";
import { useErrandActions, useErrandLink, useThankErrand } from "@/lib/errands/mutations";
import { isActive, useErrandReceipt, waitedFor, type Errand, type SecretaryPerson } from "@/lib/errands/queries";
import { etaLeftMin, etaLine, isAway, isYesNo, sceneOfAction, untilLine } from "@/lib/errands/scene";
import { receiptLine } from "@/lib/tasks/receipts";
import type { SecretaryAction } from "@/lib/settings";
import { firstNameOf } from "@/lib/text/normalize";

/**
 * Кнопку держат две секунды — и просьба уходит сразу (D-101): случайное касание ничего не
 * отправляет, пяти секунд «Отменить» после тапа больше нет. Короткий тап — второй слой:
 * примечание («без сахара»), «как обычно», срок «не беспокоить».
 */
const HOLD_SEND_MS = 2_000;
/** Shorter than this is a tap: it opens the sheet. */
const TAP_MS = 350;
/** Закрытое свежее — четверть часа: результат и «спасибо» ещё к месту. */
const RECENT_MS = 15 * 60_000;
/** Никто не взял две минуты — у директора появляется «Напомнить ещё раз». */
const STALE_MS = 2 * 60_000;
const NOTES_KEY = "pulse.errand.notes.";

/** «Не беспокоить» со сроком (D-99): режим снимется сам. */
const DND_SPANS = [
  { label: "30 мин", min: 30 },
  { label: "1 час", min: 60 },
  { label: "2 часа", min: 120 },
];

/** Последние примечания кнопки — «как обычно» одним тапом; хранятся в этом браузере. */
function savedNotes(code: string): string[] {
  try {
    const raw = window.localStorage.getItem(NOTES_KEY + code);
    return raw ? (JSON.parse(raw) as string[]).filter((n) => typeof n === "string") : [];
  } catch {
    return [];
  }
}
function rememberNote(code: string, note: string): void {
  try {
    const next = [note, ...savedNotes(code).filter((n) => n !== note)].slice(0, 4);
    window.localStorage.setItem(NOTES_KEY + code, JSON.stringify(next));
  } catch {
    // a chip that does not come back next time is still a note sent
  }
}

/**
 * Кнопки секретаря у директора (D-79, D-86): держать две секунды — просьба ушла сразу; тап —
 * шторка с примечанием и сроком (D-101). Под кнопками — что сейчас в работе:
 * квитанция «увидел / не открывал», обещание «будет через 4 мин», вопрос секретаря с ответом
 * одним тапом, «Напомнить ещё раз»; закрытое — с тем, что секретарь передал (D-99).
 * «Охрана» — тревога: та же кнопка в красном, снимается «Ложной тревогой».
 */
export function SecretaryPanel({
  actions,
  errands,
  now,
  onRefresh,
  compact = false,
  thanks = false,
  secretaries,
  meetingEndsAt = null,
}: {
  actions: readonly SecretaryAction[];
  errands: readonly Errand[];
  now: Date;
  onRefresh: () => void;
  /** the card over the face (D-85): the same buttons, a row high instead of a tile */
  compact?: boolean;
  /** «Спасибо ♥» on what was just closed (D-97) — only after the adaptation gate (D-40) */
  thanks?: boolean;
  /** who of the secretaries is at the desk (D-99); absent — not known */
  secretaries?: readonly SecretaryPerson[];
  /** the end of the director's meeting going on now — «не беспокоить до конца встречи» */
  meetingEndsAt?: string | null;
}) {
  const pending = usePendingErrands((state) => state.pending);
  const [noteFor, setNoteFor] = useState<SecretaryAction | null>(null);
  const [note, setNote] = useState("");
  // a hint in the line under the buttons, not a toast: toasts come down over the first row
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (text: string) => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint(text);
    hintTimer.current = setTimeout(() => setHint(null), 2_500);
  };

  const active = errands.filter(isActive);
  const recent = errands.filter(
    (e) =>
      e.status === "done" &&
      e.done_at &&
      now.getTime() - new Date(e.done_at).getTime() <= RECENT_MS &&
      (e.result || (thanks && !e.thanked_at)),
  );
  const nobodyHere = secretaries !== undefined && secretaries.length > 0 && secretaries.every((p) => isAway(p, now));

  const ask = (action: SecretaryAction, text: string | null, untilMin?: number) => {
    if (text) rememberNote(action.code, text);
    askSecretary(action, text, onRefresh, undefined, { untilMin: untilMin ?? null, quiet: true });
  };

  // a short tap: the sheet with the note, «как обычно» and the spans of «не беспокоить»
  const openSheet = (action: SecretaryAction) => {
    setNote("");
    setNoteFor(action);
  };

  if (actions.length === 0) {
    return (
      <p className="py-4 text-center text-[16px] leading-[22px] text-muted">
        Каталог пуст. Добавь кнопки в настройках.
      </p>
    );
  }

  // what the note sheet offers: the last notes of this button, the spans of «не беспокоить»
  const noteScene = noteFor ? sceneOfAction(noteFor) : null;
  const recentNotes = noteFor
    ? [...new Set([...savedNotes(noteFor.code), ...errands.filter((e) => e.kind === noteFor.code && e.note).map((e) => e.note as string)])].slice(0, 4)
    : [];
  const meetingLeft = meetingEndsAt ? Math.ceil((new Date(meetingEndsAt).getTime() - now.getTime()) / 60_000) : 0;

  return (
    <div className={`flex flex-col ${compact ? "gap-2" : "gap-3"}`} data-testid="secretary-panel">
      {/* the card over the face: each button is a pill as wide as its own label, and the pills
          wrap into rows — a fixed grid cut «Не беспокоить» and «Пригласи гостя» on a narrow
          phone (D-87); a label never truncates, a very long one wraps inside its pill */}
      <div className={compact ? "flex flex-wrap gap-2" : "grid grid-cols-2 gap-3"}>
        {actions.map((action) => {
          const alarm = sceneOfAction(action) === "security";
          return (
            <HoldButton
              key={action.code}
              action={action}
              compact={compact}
              alarm={alarm}
              onSend={() => ask(action, null)}
              onTap={() => (alarm ? say("Удержите «Охрану» 2 секунды — случайное касание её не вызывает") : openSheet(action))}
              onHint={say}
            />
          );
        })}
      </div>
      <p className={`px-1 text-[13px] leading-4 text-muted ${compact ? "text-center" : ""}`} style={hint ? { color: "var(--warn)" } : undefined} data-testid="panel-hint">
        {hint ?? "Держать 2 секунды — отправить · тап — примечание"}
      </p>
      {nobodyHere ? (
        <p className="px-1 text-center text-[13px] leading-4" style={{ color: "var(--warn)" }} data-testid="nobody-here">
          Сейчас никого нет на месте — просьба дождётся
        </p>
      ) : null}

      {pending.map((row) => (
        <div key={row.id} className={`card-in flex min-h-[44px] items-center justify-between gap-3 card ${compact ? "px-3 py-1" : "px-4 py-3"}`}>
          <span className="text-[15px] leading-5">
            {row.label} · <span className="text-muted">отправляю…</span>
          </span>
        </div>
      ))}

      {active.map((errand) => (
        <ActiveErrand key={errand.id} errand={errand} now={now} compact={compact} />
      ))}

      {recent.map((errand) => (
        <RecentRow key={errand.id} errand={errand} compact={compact} thanks={thanks} />
      ))}

      <Sheet open={Boolean(noteFor)} onClose={() => setNoteFor(null)} title={noteFor?.label ?? ""}>
        {noteScene === "dnd" && noteFor ? (
          // «не беспокоить» со сроком: режим снимется сам (D-99)
          <div className="mb-3 flex flex-wrap gap-2" data-testid="dnd-spans">
            {DND_SPANS.map((span) => (
              <Chip
                key={span.min}
                onClick={() => {
                  ask(noteFor, null, span.min);
                  setNoteFor(null);
                }}
              >
                На {span.label}
              </Chip>
            ))}
            {meetingLeft >= 5 ? (
              <Chip
                onClick={() => {
                  ask(noteFor, "на встречу", meetingLeft);
                  setNoteFor(null);
                }}
              >
                До конца встречи
              </Chip>
            ) : null}
          </div>
        ) : null}
        {recentNotes.length > 0 && noteFor ? (
          // «как обычно»: прошлые примечания этой кнопки одним тапом
          <div className="mb-3 flex flex-wrap gap-2" data-testid="recent-notes">
            {recentNotes.map((text) => (
              <Chip
                key={text}
                onClick={() => {
                  ask(noteFor, text);
                  setNoteFor(null);
                }}
              >
                {text}
              </Chip>
            ))}
          </div>
        ) : null}
        <input
          data-autofocus
          className="min-h-[48px] w-full field px-3 text-[16px] leading-[22px] outline-none focus:border-accent"
          placeholder="без сахара, в переговорную"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="mt-3">
          <Button
            block
            onClick={() => {
              if (noteFor) ask(noteFor, note.trim() || null);
              setNoteFor(null);
            }}
          >
            Отправить
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/**
 * Кнопка каталога (D-101): держать две секунды — полоса заполняется слева направо, дойдя до
 * конца, просьба уходит сразу; отпустил раньше — ничего не ушло, короткий тап — `onTap`.
 * «Охрана» (D-99) — та же кнопка в красном.
 */
function HoldButton({
  action,
  compact,
  alarm,
  onSend,
  onTap,
  onHint,
}: {
  action: SecretaryAction;
  compact: boolean;
  alarm: boolean;
  onSend: () => void;
  onTap: () => void;
  onHint: (text: string) => void;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sent = useRef(false);
  const pressedAt = useRef(0);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const tone = alarm ? "var(--danger)" : "var(--accent)";
  return (
    <button
      type="button"
      data-testid="errand-button"
      data-code={action.code}
      data-alarm={alarm ? "1" : undefined}
      data-holding={holding ? "1" : "0"}
      aria-label={`${action.label}: удержите две секунды, чтобы отправить`}
      onPointerDown={() => {
        sent.current = false;
        pressedAt.current = Date.now();
        setHolding(true);
        timer.current = setTimeout(() => {
          timer.current = null;
          sent.current = true;
          setHolding(false);
          haptic(alarm ? [60, 40, 60] : 30);
          onSend();
        }, HOLD_SEND_MS);
      }}
      onPointerUp={() => {
        const early = timer.current !== null;
        stop();
        if (!early || sent.current) return;
        // a tap is a tap; a hold let go half-way is a change of mind — only a hint, no sheet
        if (Date.now() - pressedAt.current < TAP_MS) onTap();
        else onHint(`Держите «${action.label}» 2 секунды, чтобы отправить`);
      }}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative flex max-w-full items-center justify-center gap-1.5 overflow-hidden border text-center transition-transform duration-[120ms] active:scale-[0.96] ${
        compact ? "min-h-[44px] flex-auto rounded-full py-1.5 pl-2 pr-2.5" : "min-h-[92px] flex-col rounded-[20px] px-3 py-4"
      }`}
      style={{
        borderColor: alarm ? "color-mix(in srgb, var(--danger) 60%, var(--border))" : "color-mix(in srgb, var(--border) 80%, transparent)",
        background: alarm ? "color-mix(in srgb, var(--danger) 14%, var(--surface-2))" : "color-mix(in srgb, var(--surface-2) 70%, transparent)",
        touchAction: "none",
        WebkitTapHighlightColor: "transparent",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      {/* the hold fills the button from the left; transform only */}
      <span
        aria-hidden
        className="absolute inset-0 origin-left"
        style={
          {
            background: `color-mix(in srgb, ${tone} ${alarm ? 45 : 32}%, transparent)`,
            transform: holding ? "scaleX(1)" : "scaleX(0)",
            transition: holding ? `transform ${HOLD_SEND_MS}ms linear` : "transform 150ms var(--ease-out)",
          } as CSSProperties
        }
      />
      <span aria-hidden className={`relative ${compact ? "shrink-0 text-[18px]" : "text-[28px]"} leading-none`}>
        {action.icon || (alarm ? "🚨" : "•")}
      </span>
      <span
        className={`relative ${compact ? "min-w-0 break-words text-[15px] leading-5" : "text-[16px] leading-[22px]"} font-semibold`}
        style={alarm ? { color: "var(--danger)" } : undefined}
        data-label
      >
        {action.label}
      </span>
    </button>
  );
}

/**
 * Одна живая заявка: что просили, кто взял, когда обещано, сколько ждёт и видел ли секретарь
 * пуш; вопрос секретаря — с ответом одним тапом (D-99).
 */
function ActiveErrand({ errand, now, compact = false }: { errand: Errand; now: Date; compact?: boolean }) {
  const transition = useErrandActions();
  const link = useErrandLink();
  const [reply, setReply] = useState("");
  // квитанция нужна, только пока никто не взялся: «принято» честнее любой галочки
  const receipt = useErrandReceipt(errand.id, errand.status === "sent");
  const line = errand.status === "sent" ? receiptLine(receipt.data, now) : null;
  const who = firstNameOf(errand.claimed?.full_name ?? "");
  const eta = etaLine(etaLeftMin(errand, now));
  const stale = errand.status === "sent" && now.getTime() - new Date(errand.created_at).getTime() >= STALE_MS;
  const asking = errand.question && !errand.answer;
  const answer = (text: string) => {
    link.mutate({ fn: "errand_answer", id: errand.id, text });
    setReply("");
  };

  return (
    <div
      className={`card-in card ${compact ? "px-3 py-1" : "px-4 py-3"}`}
      style={errand.urgent ? { borderColor: "color-mix(in srgb, var(--danger) 60%, var(--border))" } : undefined}
      data-testid="errand-active"
      data-status={errand.status}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] leading-5">
          {errand.urgent ? "🚨 " : ""}
          {errand.label}
          {errand.note ? <span className="text-muted"> · {errand.note}</span> : null}
          {errand.status === "accepted" ? (
            // без рода: «Принято · Айгуль», а не «приняла» (docs/DESIGN.md)
            <span style={{ color: "var(--ok)" }}> · Принято{who ? ` · ${who}` : ""}</span>
          ) : null}
          {eta ? <span style={{ color: eta.startsWith("опаздывает") ? "var(--warn)" : "var(--text)" }}> · {eta}</span> : null}
          {errand.until_at ? <span className="text-muted"> · {untilLine(errand.until_at)}</span> : null}
          {/* a promise already says when; the time waited would be a second number next to it */}
          {eta ? null : <span className="text-muted"> · {waitedFor(errand, now)}</span>}
        </span>
        <button
          type="button"
          className="min-h-[44px] shrink-0 text-[14px]"
          style={{ color: errand.urgent ? "var(--danger)" : "var(--text-muted)" }}
          disabled={transition.isPending}
          onClick={() => transition.mutate({ id: errand.id, to: "cancelled" })}
        >
          {errand.urgent ? "Ложная тревога" : "Отменить"}
        </button>
      </div>
      {line ? (
        <p className="mt-1 text-[13px] leading-4" style={{ color: line.tone === "warn" ? "var(--warn)" : "var(--text-muted)" }}>
          {line.text}
        </p>
      ) : null}
      {stale && !asking ? (
        <button
          type="button"
          className="mb-1 min-h-[36px] text-[13px] font-semibold text-accent"
          disabled={link.isPending}
          onClick={() => link.mutate({ fn: "errand_nudge", id: errand.id })}
          data-testid="errand-nudge"
        >
          Напомнить ещё раз
        </button>
      ) : null}
      {asking ? (
        // the secretary's question — answered here in one tap (D-99)
        <div className="mb-1.5 mt-1 flex flex-col gap-1.5" data-testid="errand-question">
          <p className="text-[14px] leading-[18px]">
            <span className="text-muted">{who || "Секретарь"} спрашивает: </span>
            <span className="font-semibold">{errand.question}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {isYesNo(errand.question ?? "") ? (
              <>
                <Chip onClick={() => answer("Да")}>Да</Chip>
                <Chip onClick={() => answer("Нет")}>Нет</Chip>
              </>
            ) : null}
            <input
              className="min-h-[36px] min-w-0 flex-1 field px-2.5 text-[15px] leading-5 outline-none focus:border-accent"
              placeholder="Ответить…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && reply.trim()) answer(reply.trim());
              }}
            />
            {reply.trim() ? (
              <button type="button" className="min-h-[36px] text-[14px] font-semibold text-accent" onClick={() => answer(reply.trim())}>
                Ответить
              </button>
            ) : null}
          </div>
        </div>
      ) : errand.question && errand.answer ? (
        <p className="mb-1 text-[13px] leading-4 text-muted">
          {errand.question} — вы ответили: {errand.answer}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Только что закрытое (D-97, D-99): что секретарь передал вместе с «Готово» и, после гейта
 * адаптации, «Спасибо ♥» — у секретаря над головой поднимаются сердечки.
 */
function RecentRow({ errand, compact, thanks }: { errand: Errand; compact: boolean; thanks: boolean }) {
  const thank = useThankErrand();
  const who = firstNameOf(errand.claimed?.full_name ?? "");
  return (
    <div className={`card-in card ${compact ? "px-3 py-1" : "px-4 py-3"}`} data-testid="errand-thank">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] leading-5">
          {errand.label}
          <span style={{ color: "var(--ok)" }}> · Готово{who ? ` · ${who}` : ""}</span>
        </span>
        {thanks && !errand.thanked_at ? (
          <button
            type="button"
            className="min-h-[44px] shrink-0 text-[14px] font-semibold"
            style={{ color: "var(--danger)" }}
            disabled={thank.isPending}
            onClick={() => thank.mutate(errand.id)}
          >
            Спасибо ♥
          </button>
        ) : null}
      </div>
      {errand.result ? (
        <p className="mb-1 text-[14px] leading-[18px]" data-testid="errand-result">
          {errand.result}
        </p>
      ) : null}
    </div>
  );
}
