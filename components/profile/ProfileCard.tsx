"use client";

import { Chip } from "@/components/ui/Chip";
import { aqtobeIsoToYmdHm, parseYmd } from "@/lib/datetime/calendar";
import { AVAILABILITY_LABEL, ROLE_LABEL, type Role } from "@/lib/people/queries";
import { STRIP_DAYS, useProfileStats } from "@/lib/profile/stats";
import { pluralRu } from "@/lib/tasks/status-text";
import { initialsOf } from "@/lib/people/names";

type Props =
  | { userId: string; fullName: string; role: Role; pending?: false }
  /** The card before the page knows who this is (the route skeleton, D-122): same boxes, grey. */
  | { pending: true; role: Role; userId?: undefined; fullName?: undefined };

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

function sinceLabel(iso: string | null): string | null {
  const day = parseYmd(aqtobeIsoToYmdHm(iso)?.ymd);
  return day ? `с ${MONTHS_GENITIVE[day.month - 1]} ${day.year}` : null;
}

const sum = (values: number[]) => values.reduce((total, n) => total + n, 0);

/** A number that has not arrived yet: a bar of the border colour, pulsing (DESIGN §2). */
function NumBone({ w, h }: { w: number; h: number }) {
  return <span aria-hidden className="skeleton block rounded-[6px]" style={{ width: w, height: h, background: "var(--border)" }} />;
}

/** One of the three numbers under the name; the label keeps two lines of room so nothing jumps. */
function Stat({ value, label, tone }: { value: string | number | null; label: string; tone?: string }) {
  return (
    <div className="flex flex-col items-center px-1">
      <span
        className="nums flex h-[28px] items-center text-[22px] font-bold leading-[28px]"
        style={tone ? { color: tone } : undefined}
      >
        {value === null ? <NumBone w={26} h={20} /> : value}
      </span>
      <span className="mt-0.5 flex min-h-[32px] max-w-[104px] items-start justify-center text-center text-[11px] leading-4 text-muted">
        {label}
      </span>
    </div>
  );
}

/** Fourteen bars, one per day: a day with nothing is a hairline, not a gap. */
function DayStrip({ days, title, caption }: { days: number[] | null; title: string; caption: string }) {
  const peak = Math.max(1, ...(days ?? []));
  return (
    <div className="mt-3 rounded-[12px] bg-surface-2 px-3 pb-3 pt-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">{title}</span>
        <span className="text-[12px] leading-4 text-muted">{days ? caption : ""}</span>
      </div>
      <div className={`mt-2 flex h-[36px] items-end gap-[3px] ${days ? "" : "skeleton"}`} aria-hidden>
        {(days ?? new Array<number>(STRIP_DAYS).fill(0)).map((count, index) => (
          <span
            key={index}
            className="flex-1 rounded-[3px]"
            style={{
              height: count ? `${Math.max(8, Math.round((36 * count) / peak))}px` : "3px",
              background: count
                ? `color-mix(in srgb, var(--accent) ${55 + Math.round((45 * count) / peak)}%, transparent)`
                : "var(--border)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The profile hero: who is signed in, the three numbers that matter for the role, and
 * the shape of the last two weeks. Points live in their own card below — the director
 * has none, and an employee sees the card only once the company switched them on (D-40)
 * or something is already on the balance.
 */
export function ProfileCard({ userId, fullName, role, pending = false }: Props) {
  const stats = useProfileStats(pending ? undefined : userId, role);
  const stat = stats.data;
  const since = sinceLabel(stat?.since ?? null);

  return (
    <section className="relative overflow-hidden card px-4 pb-4 pt-7 text-center">
      {/* static accent halo behind the avatar — one gradient, never animated */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[200px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 20%, transparent), transparent 70%)" }}
      />
      <div className="relative">
        {pending ? (
          <span aria-hidden className="skeleton mx-auto block h-[84px] w-[84px] rounded-full bg-surface-2" />
        ) : (
          <span
            className="relative mx-auto flex h-[84px] w-[84px] items-center justify-center rounded-full"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))", boxShadow: "var(--accent-glow)" }}
          >
            <span className="font-display text-[30px] font-bold tracking-[-0.02em] text-bg">{initialsOf(fullName ?? "")}</span>
            <span aria-hidden className="absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 1.5px 0 rgba(255,255,255,.35)" }} />
          </span>
        )}

        {pending ? (
          <h2 className="mt-3.5 flex h-[30px] items-center justify-center">
            <NumBone w={170} h={24} />
          </h2>
        ) : (
          <h2 className="mt-3.5 text-[24px] font-bold leading-[30px]">{fullName}</h2>
        )}
        <p className="mt-1 text-[14px] leading-[18px] text-muted">{stat ? (stat.position ?? ROLE_LABEL[role]) : " "}</p>

        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
          {/* before the data the chip keeps its box: its word is there, unseen */}
          <Chip tone="neutral" interactive={false} className={pending ? "skeleton" : ""}>
            {pending ? <span className="invisible">{ROLE_LABEL[role]}</span> : ROLE_LABEL[role]}
          </Chip>
          {stat && stat.availability !== "active" ? (
            <Chip tone="warn" interactive={false}>{AVAILABILITY_LABEL[stat.availability]}</Chip>
          ) : null}
          {since ? <span className="text-[13px] leading-4 text-muted">{since}</span> : null}
        </div>

        <div className="mt-4 grid grid-cols-3 rounded-[12px] bg-surface-2 py-3 [&>*+*]:border-l [&>*+*]:border-border">
          {role === "director" ? (
            <>
              <Stat value={stat?.people ?? null} label="в команде" />
              {/* «4 задачи», not «4 задач» (D-143) */}
              <Stat value={stat?.sent30 ?? null} label={`${pluralRu(stat?.sent30 ?? 0, ["задача", "задачи", "задач"])} за 30 дн.`} />
              {/* `open` counts given-and-not-accepted too (lib/profile/stats.ts): «открыто», not «в работе» (§4.4) */}
              <Stat value={stat?.open ?? null} label="открыто у команды" />
            </>
          ) : (
            <>
              <Stat value={stat?.open ?? null} label="открыто" />
              <Stat
                value={stat?.done30 ?? null}
                label="закрыто за 30 дн."
                tone={stat && stat.done30 > 0 ? "var(--ok)" : undefined}
              />
              <Stat
                value={stat ? (stat.onTimePct === null ? "—" : `${stat.onTimePct}%`) : null}
                label="в срок"
                tone={stat && stat.onTimePct !== null && stat.onTimePct >= 80 ? "var(--ok)" : undefined}
              />
            </>
          )}
        </div>

        <DayStrip
          days={stat?.strip ?? null}
          title="Последние 14 дней"
          caption={
            role === "director"
              ? `отправлено ${sum(stat?.strip ?? [])}`
              : `закрыто ${sum(stat?.strip ?? [])}`
          }
        />
      </div>
    </section>
  );
}
