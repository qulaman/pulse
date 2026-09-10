"use client";

import { useState } from "react";

import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { formatAqtobe } from "@/lib/ai/time";
import type { Announcement } from "@/lib/ether/queries";

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
}: {
  item: Announcement;
  userId: string | undefined;
  isDirector: boolean;
  teamSize: number;
  onAck: (id: string) => void;
  acking: boolean;
}) {
  const [who, setWho] = useState(false);
  const acked = Boolean(userId && item.acks.some((a) => a.user_id === userId));
  const count = item.acks.length;

  return (
    <article className="card-in rounded-[16px] border border-border bg-surface p-4">
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
            {item.author?.full_name ?? "Директор"} · {formatAqtobe(new Date(item.created_at))}
          </p>
        </div>
      </div>

      {item.audio_path ? <AudioOriginal path={item.audio_path} /> : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        {isDirector ? (
          <button
            type="button"
            className="nums text-[14px] leading-[18px] text-accent underline underline-offset-4"
            onClick={() => setWho(true)}
          >
            Ознакомились {count}/{teamSize}
          </button>
        ) : (
          <span className="nums text-[13px] leading-4 text-muted">Ознакомились {count}</span>
        )}

        {!isDirector ? (
          acked ? (
            <span className="text-[14px] leading-[18px]" style={{ color: "var(--ok)" }}>
              ✓ Ознакомился
            </span>
          ) : (
            <Button onClick={() => onAck(item.id)} disabled={acking}>
              Ознакомился
            </Button>
          )
        ) : null}
      </div>

      <Sheet open={who} onClose={() => setWho(false)} title="Кто ознакомился">
        {item.acks.length === 0 ? (
          <p className="text-[16px] leading-[22px] text-muted">Пока никто</p>
        ) : (
          <ul className="space-y-2">
            {item.acks.map((ack) => (
              <li key={ack.user_id} className="flex justify-between gap-3 text-[16px] leading-[22px]">
                <span>{ack.user?.full_name ?? "Сотрудник"}</span>
                <span className="nums text-[13px] text-muted">{formatAqtobe(new Date(ack.created_at))}</span>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </article>
  );
}
