"use client";

import { ArrowRight, Heart } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { useThankErrand } from "@/lib/errands/mutations";
import type { Errand } from "@/lib/errands/queries";
import { doneSpanMinutes, spanWords } from "@/lib/errands/stats";
import { shortName } from "@/lib/people/names";
import type { SecretaryAction } from "@/lib/settings";

import { ErrandTile, PersonFace } from "./look";
import { clockOf, endOf } from "./pult";
import { canThank, lower } from "./words";

/*
 * «Только что» and «Сегодня» of the director's «Пульт» (D-175): what the secretary closed — done
 * with its result in words and «Спасибо ♥» (behind the points switch, as on the phone, D-97),
 * refused with the reason and «Попросить снова». «Только что» is the last half hour, news; the
 * rest of today is a quiet journal under it. Taken back by the director himself is not news.
 */

/** «Спасибо ♥»: the heart fills and pops at the click; the server keeps the first one (D-97). */
function Thank({ errand, now, pointsOn }: { errand: Errand; now: Date; pointsOn: boolean }) {
  const thank = useThankErrand();
  const [sent, setSent] = useState(false);
  if (errand.thanked_at || sent) {
    return (
      <span className="pult-thanked" data-pop={sent ? "" : undefined} title="Спасибо отправлено">
        <Heart size={13} strokeWidth={2.25} aria-hidden />
        спасибо
      </span>
    );
  }
  if (!canThank(errand, now, pointsOn)) return null;
  return (
    <button
      type="button"
      className="pult-thank desk-focus"
      onClick={() => {
        setSent(true);
        thank.mutate(errand.id, { onError: () => setSent(false) });
      }}
      data-testid="desk-errand-thank"
    >
      <Heart size={13} strokeWidth={2.25} aria-hidden />
      Спасибо
    </button>
  );
}

function Row({
  errand,
  now,
  catalogue,
  pointsOn,
  chosen,
  fresh,
  quiet,
  onOpen,
  onAgain,
}: {
  errand: Errand;
  now: Date;
  catalogue: readonly SecretaryAction[];
  pointsOn: boolean;
  chosen: boolean;
  fresh: boolean;
  quiet: boolean;
  onOpen: (id: string) => void;
  onAgain: (errand: Errand) => void;
}) {
  const declined = errand.status === "declined";
  const who = shortName(errand.claimed?.full_name ?? "");
  const span = doneSpanMinutes(errand);
  const end = endOf(errand);
  const line = declined
    ? `не смогли${errand.decline_reason ? `: ${lower(errand.decline_reason)}` : ""}`
    : errand.result
      ? `«${errand.result}»`
      : errand.note && errand.note !== errand.label
        ? errand.note
        : null;
  return (
    <motion.div
      initial={fresh ? { opacity: 0, y: -12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 560, damping: 36, mass: 0.7 }}
      role="row"
      aria-selected={chosen}
      className="pult-done"
      data-row-key={errand.id}
      data-status={errand.status}
      data-quiet={quiet ? "" : undefined}
      data-arrived={fresh ? "" : undefined}
      data-testid="desk-pult-done"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button, a")) return;
        onOpen(errand.id);
      }}
    >
      <span role="gridcell" className="pult-done-tile">
        <ErrandTile errand={errand} catalogue={catalogue} size={quiet ? 24 : 30} muted={declined} />
      </span>
      <span role="gridcell" className="pult-done-what" title={[errand.label, line].filter(Boolean).join(" · ")}>
        <span className="pult-done-label">{errand.label}</span>
        {line ? (
          <span className="pult-done-line" data-tone={declined ? "pencil" : undefined}>
            {line}
          </span>
        ) : null}
      </span>
      <span role="gridcell" className="pult-done-who">
        {errand.claimed_by ? <PersonFace id={errand.claimed_by} name={errand.claimed?.full_name ?? who} size={20} /> : null}
        <span className="truncate">{who}</span>
      </span>
      <span role="gridcell" className="pult-done-when nums" title={declined ? "Когда отказались" : "Когда готово · сколько ждали"}>
        {end ? clockOf(end, now) : ""}
        {span !== null ? <span className="pult-done-span"> · {spanWords(span)}</span> : null}
      </span>
      <span role="gridcell" className="pult-done-move">
        {declined ? (
          <button type="button" className="pult-move desk-focus" onClick={() => onAgain(errand)} title="Та же просьба с теми же словами — уйдёт через 5 с" data-testid="desk-errand-again">
            Попросить снова
          </button>
        ) : (
          <Thank errand={errand} now={now} pointsOn={pointsOn} />
        )}
      </span>
    </motion.div>
  );
}

export function DoneList({
  title,
  rows,
  now,
  catalogue,
  pointsOn,
  openId,
  fresh,
  quiet = false,
  more,
  onOpen,
  onAgain,
  onHistory,
  testId,
}: {
  title: string;
  rows: readonly Errand[];
  now: Date;
  catalogue: readonly SecretaryAction[];
  pointsOn: boolean;
  openId: string | null;
  fresh: ReadonlySet<string>;
  /** the day's journal: smaller rows */
  quiet?: boolean;
  /** rows of the day not shown */
  more?: number;
  onOpen: (id: string) => void;
  onAgain: (errand: Errand) => void;
  onHistory?: () => void;
  testId: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="pult-section" data-testid={testId} aria-label={title}>
      <SectionLabel
        count={rows.length + (more ?? 0)}
        action={
          onHistory ? (
            <button type="button" className="pult-link desk-focus" onClick={onHistory}>
              История <ArrowRight size={14} strokeWidth={2.25} aria-hidden />
            </button>
          ) : undefined
        }
      >
        {title}
      </SectionLabel>
      <div role="grid" aria-label={title} className="pult-card pult-dones" data-quiet={quiet ? "" : undefined}>
        {rows.map((errand) => (
          <Row
            key={errand.id}
            errand={errand}
            now={now}
            catalogue={catalogue}
            pointsOn={pointsOn}
            chosen={openId === errand.id}
            fresh={fresh.has(errand.id)}
            quiet={quiet}
            onOpen={onOpen}
            onAgain={onAgain}
          />
        ))}
        {more && more > 0 && onHistory ? (
          <button type="button" className="pult-done-more desk-focus" onClick={onHistory}>
            …ещё {more} — в «Истории»
          </button>
        ) : null}
      </div>
    </section>
  );
}
