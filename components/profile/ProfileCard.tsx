"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Mascot } from "@/components/brand/Mascot";
import { Chip } from "@/components/ui/Chip";
import { Bone } from "@/components/ui/Skeleton";
import { AVAILABILITY_LABEL, ROLE_LABEL, initialsOf, type Availability, type Role } from "@/lib/people/queries";
import { balanceOf, usePointHistory } from "@/lib/points/queries";
import { createBrowserSupabase } from "@/lib/supabase/client";

type Props = {
  userId: string;
  fullName: string;
  role: Role;
};

type Stats = { done30: number; onTimePct: number | null; open: number; position: string | null; availability: Availability; people?: number; sent30?: number };

function useProfileStats(userId: string, role: Role) {
  return useQuery({
    queryKey: ["profile-stats", userId],
    queryFn: async (): Promise<Stats> => {
      const supabase = createBrowserSupabase();
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const me = await supabase.from("profiles").select("position, availability").eq("id", userId).single();

      if (role === "director") {
        const [people, sent, openAll] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true).not("role", "in", "(tv,director)"),
          supabase.from("tasks").select("id", { count: "exact", head: true }).gte("created_at", since),
          supabase.from("tasks").select("id", { count: "exact", head: true }).in("status", ["sent", "accepted", "rework", "pending_review"]),
        ]);
        return {
          done30: 0,
          onTimePct: null,
          open: openAll.count ?? 0,
          position: me.data?.position ?? null,
          availability: me.data?.availability ?? "active",
          people: people.count ?? 0,
          sent30: sent.count ?? 0,
        };
      }

      const [done, open] = await Promise.all([
        supabase.from("tasks").select("deadline, closed_at").eq("assignee_id", userId).eq("status", "done").gte("closed_at", since),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", userId).in("status", ["sent", "accepted", "rework", "pending_review"]),
      ]);
      const rows = done.data ?? [];
      const onTime = rows.filter((t) => !t.deadline || (t.closed_at && t.closed_at <= t.deadline)).length;
      return {
        done30: rows.length,
        onTimePct: rows.length ? Math.round((100 * onTime) / rows.length) : null,
        open: open.count ?? 0,
        position: me.data?.position ?? null,
        availability: me.data?.availability ?? "active",
      };
    },
  });
}

function Stat({ value, label }: { value: string | number | null; label: string }) {
  return (
    <div className="rounded-[12px] bg-surface-2 px-3 py-2 text-center">
      <p className="nums flex h-[30px] items-center justify-center text-[24px] font-bold leading-[30px]">
        {value === null ? <Bone h={22} w={28} className="bg-border" /> : value}
      </p>
      <p className="text-[11px] leading-4 text-muted">{label}</p>
    </div>
  );
}

export function ProfileCard({ userId, fullName, role }: Props) {
  const stats = useProfileStats(userId, role);
  const history = usePointHistory(role === "director" ? undefined : userId);
  const balance = balanceOf(history.data);
  const s = stats.data;

  return (
    <>
      <section className="card p-4">
        <div className="flex items-center gap-4">
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-[22px] font-bold text-bg"
            style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)" }}
          >
            {initialsOf(fullName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[19px] font-semibold leading-6">{fullName}</p>
            <p className="mt-0.5 text-[13px] leading-4 text-muted">{s?.position ?? ROLE_LABEL[role]}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip tone="neutral" interactive={false}>{ROLE_LABEL[role]}</Chip>
              {s && s.availability !== "active" ? (
                <Chip tone="warn" interactive={false}>{AVAILABILITY_LABEL[s.availability]}</Chip>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {role === "director" ? (
            <>
              <Stat value={s?.people ?? null} label="в команде" />
              <Stat value={s?.sent30 ?? null} label="задач за 30 дн." />
              <Stat value={s?.open ?? null} label="в работе у команды" />
            </>
          ) : (
            <>
              <Stat value={s?.open ?? null} label="открытых" />
              <Stat value={s?.done30 ?? null} label="закрыто за 30 дн." />
              <Stat value={s?.onTimePct === null || s?.onTimePct === undefined ? "—" : `${s.onTimePct}%`} label="в срок" />
            </>
          )}
        </div>
      </section>

      {role !== "director" ? (
        <section className="mt-4 card p-4">
          <div className="flex items-center gap-4">
            <Mascot state={balance > 0 ? "happy" : "calm"} size={48} />
            <div>
              <p className="text-[13px] leading-4 text-muted">Очки</p>
              <p data-testid="balance" className="nums text-[32px] font-bold leading-9" style={{ color: "var(--gold)" }}>
                {history.isLoading ? <Bone h={28} w={36} className="inline-block bg-border" /> : balance}
              </p>
            </div>
            <Link href="/rating" className="ml-auto text-[13px] leading-4 text-accent underline underline-offset-4">
              Рейтинг
            </Link>
          </div>
          {history.data && history.data.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {history.data.slice(0, 3).map((row) => (
                <li key={row.id} className="flex justify-between gap-3 text-[14px] leading-[18px]">
                  <span className="truncate">
                    <span className="nums font-semibold" style={{ color: row.amount > 0 ? "var(--gold)" : "var(--danger)" }}>
                      {row.amount > 0 ? `+${row.amount}` : row.amount}
                    </span>{" "}
                    {row.reason}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] leading-4 text-muted">Очков пока нет. Первые придут за закрытые задачи</p>
          )}
        </section>
      ) : null}
    </>
  );
}
