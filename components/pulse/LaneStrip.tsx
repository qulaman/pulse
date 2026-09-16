"use client";

import { Chip, type ChipTone } from "@/components/ui/Chip";
import type { Lane, LaneCounts } from "@/lib/pulse/board";
import { pluralRu } from "@/lib/tasks/status-text";

const STRIP: { lane: Lane; tone: ChipTone; word: [string, string, string] }[] = [
  { lane: "overdue", tone: "danger", word: ["просрочена", "просрочены", "просрочено"] },
  { lane: "declined", tone: "danger", word: ["отказ", "отказа", "отказов"] },
  { lane: "question", tone: "warn", word: ["сообщение", "сообщения", "сообщений"] },
  { lane: "review", tone: "ok", word: ["на приёмке", "на приёмке", "на приёмке"] },
];

/**
 * The counts of what needs the director, one chip per lane — the verdict that stays on
 * screen while the line under the mascot moves on. With `onSelect` the chips also steer
 * the deck: a tap jumps to the first card of that lane.
 */
export function LaneStrip({ counts, active, onSelect }: { counts: LaneCounts; active?: Lane | null; onSelect?: (lane: Lane) => void }) {
  if (counts.attention === 0) return null;
  return (
    <div className="mb-1 flex flex-wrap gap-2" aria-label="Сводка">
      {STRIP.filter((item) => counts[item.lane] > 0).map((item) => (
        <Chip
          key={item.lane}
          tone={item.tone}
          interactive={Boolean(onSelect)}
          onClick={onSelect ? () => onSelect(item.lane) : undefined}
          className={active === item.lane ? "ring-[2px] ring-current/40" : ""}
        >
          <span className="nums">{counts[item.lane]}</span> {pluralRu(counts[item.lane], item.word)}
        </Chip>
      ))}
    </div>
  );
}
