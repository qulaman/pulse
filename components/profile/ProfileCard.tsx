"use client";

import { useQuery } from "@tanstack/react-query";

import { Chip } from "@/components/ui/Chip";
import { aqtobeDay } from "@/lib/ai/time";
import { AVAILABILITY_LABEL, ROLE_LABEL, initialsOf, type Availability, type Role } from "@/lib/people/queries";
import { createBrowserSupabase } from "@/lib/supabase/client";

type Props = {
  userId: string;
  fullName: string;
  role: Role;
};

/** Fourteen day-buckets, oldest first — the strip inside the identity card. */
const STRIP_DAYS = 14;

type Stats = {
  done30: number;
  onTimePct: number | null;
  open: number;
  position: string | null;
  availability: Availability;
  since: string | null;
  strip: number[];
  people?: number;
  sent30?: number;
};

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
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const wall = new Date(date.getTime() + 5 * 3_600_000);
  return `с ${MONTHS_GENITIVE[wall.getUTCMonth()]} ${wall.getUTCFullYear()}`;
}

/** Counts instants into the last fourteen Aqtobe days, oldest bucket first. */
function stripOf(dates: (string | null)[], now = Date.now()): number[] {
  const today = aqtobeDay(new Date(now));
  const buckets = new Array<number>(STRIP_DAYS).fill(0);
  for (const iso of dates) {
    if (!iso) continue;
    const index = STRIP_DAYS - 1 - (today - aqtobeDay(new Date(iso)));
    if (index >= 0 && index < STRIP_DAYS) buckets[index] += 1;
  }
  return buckets;
}

const sum = (values: number[]) => values.reduce((total, n) => total + n, 0);

function useProfileStats(userId: string, role: Role) {
  return useQuery({
    queryKey: ["profile-stats", userId],
    queryFn: async (): Promise<Stats> => {
      const supabase = createBrowserSupabase();
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const me = await supabase.from("profiles").select("position, availability, created_at").eq("id", userId).single();
      const common = {
        position: me.data?.position ?? null,
        availability: me.data?.availability ?? ("active" as Availability),
        since: me.data?.created_at ?? null,
      };

      if (role === "director") {
        const [people, sent, openAll] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true).not("role", "in", "(tv,director)"),
          supabase.from("tasks").select("created_at").gte("created_at", since),
          supabase.from("tasks").select("id", { count: "exact", head: true }).in("status", ["sent", "accepted", "rework", "pending_review"]),
        ]);
        const created = sent.data ?? [];
        return {
          ...common,
          done30: 0,
          onTimePct: null,
          open: openAll.count ?? 0,
          strip: stripOf(created.map((task) => task.created_at)),
          people: people.count ?? 0,
          sent30: created.length,
        };
      }

      const [done, open] = await Promise.all([
        supabase.from("tasks").select("deadline, closed_at").eq("assignee_id", userId).eq("status", "done").gte("closed_at", since),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", userId).in("status", ["sent", "accepted", "rework", "pending_review"]),
      ]);
      const rows = done.data ?? [];
      const onTime = rows.filter((task) => !task.deadline || (task.closed_at && task.closed_at <= task.deadline)).length;
      return {
        ...common,
        done30: rows.length,
        onTimePct: rows.length ? Math.round((100 * onTime) / rows.length) : null,
        open: open.count ?? 0,
        strip: stripOf(rows.map((task) => task.closed_at)),
      };
    },
  });
}

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
export function ProfileCard({ userId, fullName, role }: Props) {
  const stats = useProfileStats(userId, role);
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
        <span
          className="relative mx-auto flex h-[84px] w-[84px] items-center justify-center rounded-full"
          style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))", boxShadow: "var(--accent-glow)" }}
        >
          <span className="font-display text-[30px] font-bold tracking-[-0.02em] text-bg">{initialsOf(fullName)}</span>
          <span aria-hidden className="absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 1.5px 0 rgba(255,255,255,.35)" }} />
        </span>

        <h2 className="mt-3.5 text-[24px] font-bold leading-[30px]">{fullName}</h2>
        <p className="mt-1 text-[14px] leading-[18px] text-muted">{stat ? (stat.position ?? ROLE_LABEL[role]) : " "}</p>

        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
          <Chip tone="neutral" interactive={false}>{ROLE_LABEL[role]}</Chip>
          {stat && stat.availability !== "active" ? (
            <Chip tone="warn" interactive={false}>{AVAILABILITY_LABEL[stat.availability]}</Chip>
          ) : null}
          {since ? <span className="text-[13px] leading-4 text-muted">{since}</span> : null}
        </div>

        <div className="mt-4 grid grid-cols-3 rounded-[12px] bg-surface-2 py-3 [&>*+*]:border-l [&>*+*]:border-border">
          {role === "director" ? (
            <>
              <Stat value={stat?.people ?? null} label="в команде" />
              <Stat value={stat?.sent30 ?? null} label="задач за 30 дн." />
              <Stat value={stat?.open ?? null} label="в работе у команды" />
            </>
          ) : (
            <>
              <Stat value={stat?.open ?? null} label="в работе" />
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
