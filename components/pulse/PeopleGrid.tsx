"use client";

import Link from "next/link";

import { PeopleGridBone, SkeletonGroup } from "@/components/ui/Skeleton";
import { initialsOf, usePeople } from "@/lib/people/queries";
import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";

type Load = { active: number; overdue: number; nearest: string | null };
type LoadColor = "gray" | "green" | "yellow" | "red";

const COLOR: Record<LoadColor, string> = {
  gray: "var(--text-muted)",
  green: "var(--ok)",
  yellow: "var(--warn)",
  red: "var(--danger)",
};

/** docs/DATABASE.md v_employee_load rules, computed on the client until the view lands. */
function colorOf(load: Load | undefined, available: boolean): LoadColor {
  if (!available || !load || load.active === 0) return "gray";
  if (load.overdue > 0) return "red";
  if (load.nearest && new Date(load.nearest).getTime() < Date.now() + 24 * 3_600_000) return "yellow";
  return "green";
}

function useLoads() {
  return useRealtimeQuery<Record<string, Load>>({
    queryKey: ["tasks", "loads"],
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("tasks")
        .select("assignee_id, deadline, status")
        .in("status", ["sent", "accepted", "in_progress", "rework", "pending_review"]);
      if (error) throw new Error(error.message);
      const now = Date.now();
      const loads: Record<string, Load> = {};
      for (const task of data ?? []) {
        const load = (loads[task.assignee_id] ??= { active: 0, overdue: 0, nearest: null });
        load.active += 1;
        const openForOverdue = task.status !== "pending_review";
        if (task.deadline) {
          if (openForOverdue && new Date(task.deadline).getTime() < now) load.overdue += 1;
          if (!load.nearest || task.deadline < load.nearest) load.nearest = task.deadline;
        }
      }
      return loads;
    },
    channel: { table: "tasks" },
  });
}

/** «Команда»: the team at a glance — one dot per person, tap opens the card. */
export function PeopleGrid({ title = "Люди" }: { title?: string }) {
  const people = usePeople();
  const loads = useLoads();

  const team = (people.data ?? []).filter((p) => p.is_active && p.role !== "tv" && p.role !== "director");
  if (people.isLoading) {
    return (
      <SkeletonGroup className="mt-7">
        <h2 className="text-[19px] font-semibold leading-6">Люди</h2>
        <div className="mt-3">
          <PeopleGridBone />
        </div>
      </SkeletonGroup>
    );
  }
  if (team.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-2 text-[19px] font-semibold leading-6">
        {title}
        <span className="nums rounded-full bg-surface-2 px-2 text-[13px] leading-5 text-muted">{team.length}</span>
      </h2>
      <ul className="mt-3 grid grid-cols-4 gap-2">
        {team.map((person) => {
          const load = loads.data?.[person.id];
          const color = colorOf(load, person.availability === "active");
          const first = person.full_name.split(/\s+/)[0] ?? person.full_name;
          return (
            <li key={person.id} className="card-in">
              <Link
                href={`/people/${person.id}`}
                className="flex flex-col items-center card px-1 py-3 text-center transition-transform duration-[120ms] active:scale-[0.97]"
              >
                <span className="relative">
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-full text-[14px] font-semibold text-bg"
                    style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)" }}
                  >
                    {initialsOf(person.full_name)}
                  </span>
                  <span
                    aria-hidden
                    className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-surface"
                    style={{ background: COLOR[color] }}
                  />
                  {load && load.active > 0 ? (
                    <span className="nums absolute -top-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-2 px-1 text-[11px] font-semibold">
                      {load.active}
                    </span>
                  ) : null}
                </span>
                <span className="mt-2 w-full truncate text-[12px] leading-4">{first}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-4 text-muted">
        зелёный — в срок · жёлтый — дедлайн ближе суток · красный — просрочка · серый — свободен или в отпуске
      </p>
    </section>
  );
}
