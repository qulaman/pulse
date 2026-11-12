"use client";

import { useState } from "react";

import { AnnouncementCard } from "@/components/ether/AnnouncementCard";
import type { Announcement } from "@/lib/ether/queries";

/** Component sandbox: Эфир cards as the director sees them, with no network behind them (D-166 read bar). */

const ack = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ user_id: `u${i}`, created_at: "2026-11-10T05:00:00Z", user: { full_name: `Сотрудник ${i + 1}` } }));

const ITEMS: Announcement[] = [
  { id: "a1", company_id: "c", author_id: "d", audio_path: null, created_at: "2026-11-10T04:30:00Z", transcript: "Всем: завтра в 9:00 планёрка в большом зале.", author: { full_name: "Тимур Сапаров" }, acks: ack(7) },
  { id: "a2", company_id: "c", author_id: "d", audio_path: null, created_at: "2026-11-09T11:10:00Z", transcript: "С понедельника обед с 13:00 до 14:00.", author: { full_name: "Тимур Сапаров" }, acks: ack(12) },
  { id: "a3", company_id: "c", author_id: "d", audio_path: null, created_at: "2026-11-09T06:00:00Z", transcript: "Проверка пожарной сигнализации в среду.", author: { full_name: "Тимур Сапаров" }, acks: [] },
];

export default function EtherSandbox() {
  const [key, setKey] = useState(0);
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 py-6">
      <button type="button" className="self-start text-[14px] text-accent underline" onClick={() => setKey((k) => k + 1)}>
        Открыть заново
      </button>
      <div key={key} className="flex flex-col gap-3">
        {ITEMS.map((item) => (
          <AnnouncementCard key={item.id} item={item} userId="d" isDirector teamSize={12} onAck={() => {}} acking={false} onDelete={() => {}} />
        ))}
      </div>
    </main>
  );
}
