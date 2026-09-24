"use client";

import { toast } from "@/components/ui/Toast";
import type { Misheard as Lesson } from "@/lib/dictionary-learn";
import { useDismissMisheard, useEditAliases } from "@/lib/dictionary-queries";
import { pluralRu } from "@/lib/tasks/status-text";

const DAY_MS = 86_400_000;

/** «сегодня», «вчера», «5 дней назад» — by the calendar day in Aqtobe, not by 24-hour spans. */
function whenLine(iso: string, now = Date.now()): string {
  const day = (ms: number) => Math.floor((ms + 5 * 3_600_000) / DAY_MS);
  const days = day(now) - day(new Date(iso).getTime());
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  return `${days} ${pluralRu(days, ["день", "дня", "дней"])} назад`;
}

/**
 * «Из ваших записей» (D-111, second wave): the names the AI could not place in the
 * director's recordings and the person the director chose for them — one tap remembers
 * the form, «×» hides the pair for good (a nickname used once, a slip of the tongue). The
 * list is the server's (`GET /api/dictionary/misheard`); only pairs, never what was said.
 */
export function Misheard({
  items,
  lockedIds,
  onAdded,
}: {
  items: Lesson[];
  /** People this viewer may not edit — their lessons are not offered. */
  lockedIds: ReadonlySet<string>;
  onAdded: (id: string, entries: string[]) => void;
}) {
  const edit = useEditAliases();
  const dismiss = useDismissMisheard();
  const visible = items.filter((item) => !lockedIds.has(item.personId));
  if (!visible.length) return null;

  return (
    <section className="card-in card px-4 py-4" data-testid="dictionary-misheard">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[17px] font-semibold leading-[22px] tracking-[-0.01em]">Из ваших записей</h2>
        <span className="nums text-[13px] leading-4 text-muted">{visible.length}</span>
      </div>
      <p className="mt-0.5 text-[13px] leading-[18px] text-muted">
        ИИ не узнал эти имена, и вы выбрали человека сами. Запомнить — в следующий раз узнает
      </p>
      <ul className="mt-3 flex flex-col">
        {visible.map((item) => (
          <li key={item.key} className="flex min-h-[56px] items-center gap-2 border-t border-border/70 py-2 first:border-t-0">
            {/* the form on its own line, the person under it: a phone-wide row cannot hold both */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-5">«{item.form}»</p>
              <p className="text-[13px] leading-[18px]">
                <span aria-hidden className="text-muted">→ </span>
                {item.fullName}
                <span className="text-muted">
                  {" · "}
                  {item.times > 1 ? `${item.times} ${pluralRu(item.times, ["раз", "раза", "раз"])}, ` : ""}
                  {whenLine(item.lastAt)}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                edit.mutate({ id: item.personId, add: [item.form] });
                onAdded(item.personId, [item.form]);
                toast(`Запомнил: «${item.form}» — ${item.fullName}`);
              }}
              className="min-h-[36px] shrink-0 rounded-[10px] px-3 font-display text-[14px] font-semibold text-accent transition-transform duration-[120ms] active:scale-[0.96]"
              style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}
            >
              Запомнить
            </button>
            <button
              type="button"
              aria-label={`Не запоминать «${item.form}»`}
              onClick={() => dismiss.mutate([item.key])}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center text-[18px] leading-none text-muted after:absolute after:-inset-1 after:content-['']"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
