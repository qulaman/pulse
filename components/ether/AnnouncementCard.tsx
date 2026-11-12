"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { humanAqtobe } from "@/lib/ai/time";
import { springs } from "@/lib/design/tokens";
import type { Announcement } from "@/lib/ether/queries";
import { whenHeld } from "@/lib/tasks/held";

const ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 10v4h3l6 4V6l-6 4z" />
    <path d="M16.5 9.5a3.5 3.5 0 0 1 0 5" />
  </svg>
);

export function AnnouncementCard({
  item,
  userId,
  isDirector,
  teamSize,
  onAck,
  acking,
  onDelete,
  heldUntil,
  onSendNow,
}: {
  item: Announcement;
  userId: string | undefined;
  isDirector: boolean;
  /** Who could read it; unknown yet — the count alone, never «3/0». */
  teamSize: number | undefined;
  onAck: (id: string) => void;
  acking: boolean;
  /** The director's «Удалить» — the announcement is gone for everybody. */
  onDelete?: (id: string) => void;
  /** Held for the delivery window (D-38): when the team's pushes go. */
  heldUntil?: string | null;
  /** The director's «отправить сейчас» on a held announcement (D-129). */
  onSendNow?: (id: string) => void;
}) {
  const [who, setWho] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const acked = Boolean(userId && item.acks.some((a) => a.user_id === userId));
  const count = item.acks.length;
  // read before this card was on the screen: the mark just stands; read here — it answers the tap
  const [ackedAtMount] = useState(acked);

  return (
    <article className="card-in card p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
          style={{ color: "var(--gold)", background: "color-mix(in srgb, var(--gold) 14%, transparent)" }}
        >
          {ICON}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] leading-[22px]">{item.transcript}</p>
          <p className="nums mt-1 text-[13px] leading-4 text-muted">
            {item.author?.full_name ?? "Директор"} · {humanAqtobe(new Date(item.created_at))}
          </p>
          {/* dictated at night, it waits for the morning like every word to the team — unless «now» */}
          {isDirector && onSendNow && heldUntil && new Date(heldUntil) > new Date() ? (
            <p className="nums mt-1 text-[13px] leading-4 text-muted" data-testid="ether-held">
              {`Отправлю ${whenHeld(heldUntil)} · `}
              <button
                type="button"
                className="underline underline-offset-2"
                style={{ color: "var(--accent)" }}
                onClick={() => onSendNow(item.id)}
                data-testid="ether-send-now"
              >
                отправить сейчас
              </button>
            </p>
          ) : null}
        </div>
      </div>

      {item.audio_path ? <AudioOriginal path={item.audio_path} /> : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        {isDirector ? (
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            <button
              type="button"
              className="nums text-[14px] leading-[18px] text-accent underline underline-offset-4"
              onClick={() => setWho(true)}
            >
              Ознакомились {count}
              {teamSize === undefined ? null : `/${teamSize}`}
            </button>
            {/* how far the word has gone round the team, filling up as the card opens (D-166) */}
            {teamSize ? (
              <span
                aria-hidden
                className="block h-[3px] w-[132px] overflow-hidden rounded-full"
                style={{ background: "color-mix(in srgb, var(--text-muted) 18%, transparent)" }}
                data-testid="ether-read-bar"
              >
                <motion.span
                  className="block h-full w-full origin-left rounded-full"
                  style={{ background: count >= teamSize ? "var(--ok)" : "var(--accent)" }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: Math.min(1, count / teamSize) }}
                  transition={{ duration: 0.8, delay: 0.15, ease: [0.2, 0.7, 0.2, 1] }}
                />
              </span>
            ) : null}
          </div>
        ) : (
          <span className="nums text-[13px] leading-4 text-muted">Ознакомились {count}</span>
        )}

        {isDirector && onDelete ? (
          <button type="button" className="text-[14px] leading-[18px] text-danger/80" onClick={() => setConfirming(true)}>
            Удалить
          </button>
        ) : null}
        {!isDirector ? (
          acked ? (
            <AckedMark fresh={!ackedAtMount} />
          ) : (
            <Button onClick={() => onAck(item.id)} disabled={acking}>
              Ознакомился
            </Button>
          )
        ) : null}
      </div>

      <Sheet open={confirming} onClose={() => setConfirming(false)} title="Удалить объявление">
        <p className="text-[16px] leading-[22px] text-muted">Объявление исчезнет из Эфира у всех, вместе с отметками «Ознакомился».</p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="danger"
            block
            onClick={() => {
              onDelete?.(item.id);
              setConfirming(false);
            }}
          >
            Удалить
          </Button>
          <Button variant="secondary" block onClick={() => setConfirming(false)}>
            Не сейчас
          </Button>
        </div>
      </Sheet>

      <Sheet open={who} onClose={() => setWho(false)} title="Кто ознакомился">
        {item.acks.length === 0 ? (
          <p className="text-[16px] leading-[22px] text-muted">Пока никто</p>
        ) : (
          <ul className="space-y-2">
            {item.acks.map((ack) => (
              <li key={ack.user_id} className="flex justify-between gap-3 text-[16px] leading-[22px]">
                <span>{ack.user?.full_name ?? "Сотрудник"}</span>
                <span className="nums text-[13px] text-muted">{humanAqtobe(new Date(ack.created_at))}</span>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </article>
  );
}

/**
 * «✓ Ознакомился» where the button was (D-167). Just read, it answers the tap: the button's
 * place glows and fades, the mark pops in on the living spring and its tick draws itself — over
 * the ack already written. It keeps the button's height, so the card does not move.
 */
function AckedMark({ fresh }: { fresh: boolean }) {
  const still = useReducedMotion();
  const plays = fresh && !still;
  return (
    <span className="relative inline-flex min-h-[44px] items-center px-3" data-testid="ether-acked">
      {plays ? (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-[12px]"
          style={{ background: "color-mix(in srgb, var(--ok) 30%, transparent)" }}
          initial={{ opacity: 1, scale: 1 }}
          animate={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.55, delay: 0.18, ease: [0.4, 0, 1, 1] }}
        />
      ) : null}
      <motion.span
        className="relative inline-flex items-center gap-1.5 text-[14px] font-semibold leading-[18px]"
        style={{ color: "var(--ok)" }}
        initial={plays ? { scale: 0.7, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ scale: springs.alive, opacity: { duration: 0.12 } }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <motion.path
            d="M5 12.5l4.5 4.5L19 7.5"
            initial={plays ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.3, delay: 0.08, ease: [0.2, 0, 0, 1] }}
          />
        </svg>
        Ознакомился
      </motion.span>
    </span>
  );
}
