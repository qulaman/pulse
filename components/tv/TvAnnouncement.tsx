"use client";

import { motion } from "motion/react";

import { tvTime } from "@/lib/tv/clock";
import { announcementView, type TvAnnouncementData } from "@/lib/tv/results";

/**
 * Сцена «Объявление» (D-182): сегодняшнее объявление директора крупно, первым в дневном круге.
 * Короткое — заголовком, длинное — мельче, но не ниже `tv-text`; совсем длинное обрезается
 * многоточием. «Ознакомились 34» — без «из N» (D-45). Гостю сцена не приходит (D-33).
 */

const EASE = [0.2, 0, 0, 1] as const;

export function TvAnnouncement({ announcement, now }: { announcement: TvAnnouncementData; now: Date }) {
  const view = announcementView(announcement);
  const at = new Date(announcement.at);
  const sameDay = Number.isFinite(at.getTime()) && Math.abs(now.getTime() - at.getTime()) < 86_400_000;

  return (
    <section className="flex h-full w-full max-w-[86vw] flex-col justify-center gap-[4vh]" data-testid="tv-announcement">
      <p className="tv-caption font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--gold)" }}>
        Объявление{sameDay ? ` · ${tvTime(at)}` : ""}
      </p>
      <motion.p
        className={`${view.size} whitespace-pre-line font-semibold [overflow-wrap:anywhere]`}
        initial={{ opacity: 0, y: "2vh" }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        {view.text}
      </motion.p>
      {view.acks ? <p className="tv-text nums tabular-nums text-muted">{view.acks}</p> : null}
    </section>
  );
}
