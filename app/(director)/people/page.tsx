"use client";

import Link from "next/link";

import { TeamList } from "@/components/people/TeamList";
import { PeopleGrid } from "@/components/pulse/PeopleGrid";
import { Button } from "@/components/ui/Button";
import { TeamListBone } from "@/components/ui/PageSkeletons";
import { useTeamLoads } from "@/lib/people/loads";
import { usePeople } from "@/lib/people/queries";
import { usePointsEnabled } from "@/lib/points/queries";

function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

/**
 * «Команда»: the grid of who is loaded how right now (FRONTEND «Команда»), then the
 * full roster with search, filters and sorts — the director finds a free person or a
 * drowning one in two taps.
 */
export default function PeoplePage() {
  const people = usePeople();
  const loads = useTeamLoads();
  const pointsOn = usePointsEnabled().data === true;

  const staff = (people.data ?? []).filter((p) => p.is_active && p.role !== "tv");
  const away = staff.filter((p) => p.availability !== "active").length;
  const open = Object.values(loads.data ?? {}).reduce((sum, l) => sum + l.active, 0);
  const overdue = Object.values(loads.data ?? {}).reduce((sum, l) => sum + l.overdue, 0);
  const ready = !people.isLoading && !loads.isLoading;

  const summary = ready
    ? [
        `${staff.length - away} на месте`,
        away > 0 ? `${away} ${plural(away, ["отсутствует", "отсутствуют", "отсутствуют"])}` : null,
        `${open} ${plural(open, ["задача", "задачи", "задач"])} в работе`,
        overdue > 0 ? `${overdue} просроч.` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : " ";

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold leading-[30px]">Команда</h1>
          <p className="nums mt-1 min-h-4 truncate text-[13px] leading-4 text-muted">{summary}</p>
        </div>
        <Link href="/people/new" className="shrink-0">
          <Button>+ Добавить</Button>
        </Link>
      </div>

      <PeopleGrid title="Сейчас" />

      <Link
        href="/rating"
        className="mt-6 flex min-h-[48px] items-center justify-between card px-4 text-[16px] leading-[22px]"
      >
        Рейтинг
        <span className="text-[13px] leading-4 text-muted">очки и динамика ›</span>
      </Link>

      <h2 className="mt-7 text-[19px] font-semibold leading-6">Все сотрудники</h2>
      {people.isLoading ? <TeamListBone /> : <TeamList people={people.data ?? []} loads={loads.data} pointsOn={pointsOn} />}
    </main>
  );
}
