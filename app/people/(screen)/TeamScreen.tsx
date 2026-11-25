"use client";

import Link from "next/link";

import { NoPushSummary } from "@/components/people/NoPushSummary";
import { TeamList } from "@/components/people/TeamList";
import { PeopleGrid } from "@/components/pulse/PeopleGrid";
import { HeadButton } from "@/components/ui/HeadButton";
import { PageHead } from "@/components/ui/PageHead";
import { useTeamLoads } from "@/lib/people/loads";
import { usePeople } from "@/lib/people/queries";
import { taskStageParts } from "@/lib/people/counts";
import { countTeam } from "@/lib/people/team";
import { usePointsEnabled } from "@/lib/points/queries";
import { usePushHealth } from "@/lib/push/health-query";
import { pluralRu } from "@/lib/tasks/status-text";
import { useMe } from "@/lib/tasks/queries";

/**
 * «Команда»: the grid of who is loaded how right now (FRONTEND «Команда»), then the
 * full roster with search, filters and sorts — the director finds a free person or a
 * drowning one in two taps.
 */
export function TeamScreen() {
  const people = usePeople();
  const loads = useTeamLoads();
  const pointsOn = usePointsEnabled().data === true;
  const me = useMe();
  const push = usePushHealth();

  // the team as every screen counts it (lib/people/team.ts): no director, no kiosk, nobody who left
  const team = countTeam(people.data ?? []);
  const all = Object.values(loads.data ?? {});
  // the stages in the product's words (§4.4): «в работе» is only what somebody took; given and not
  // accepted is «не принята», handed in is «на проверке»
  const waiting = all.reduce((sum, l) => sum + (l.waiting ?? 0), 0);
  const review = all.reduce((sum, l) => sum + l.review, 0);
  const working = all.reduce((sum, l) => sum + l.active, 0) - waiting - review;
  const overdue = all.reduce((sum, l) => sum + l.overdue, 0);
  const ready = !people.isLoading && !loads.isLoading;

  // said once, no empty «0 …» (an empty team is one short line)
  const summary = !ready
    ? " "
    : team.team === 0
      ? "В команде пока никого"
      : [
          team.away === 0 ? `${team.here} на месте` : `${team.here} из ${team.team} на месте`,
          team.away > 0 ? `${team.away} ${pluralRu(team.away, ["отсутствует", "отсутствуют", "отсутствуют"])}` : null,
          ...taskStageParts(working, review, waiting),
          overdue > 0 ? `${overdue} просроч.` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead
        title="Команда"
        // no status card here: the head says the team's state itself, red when someone is late (D-117)
        tone={overdue > 0 ? "danger" : "muted"}
        state={<span className="nums">{summary}</span>}
        actions={<HeadButton label="Добавить сотрудника" icon="plus" tone="accent" href="/people/new" />}
      />

      <PeopleGrid title="Сейчас" />

      {/* under the grid only once the grid has its size: it grows with the team, and what
          stood under it while it loaded jumped down when it arrived (D-122) */}
      {people.isLoading ? null : (
        <>
          <Link
            href="/rating"
            className="mt-6 flex min-h-[48px] items-center justify-between card px-4 text-[16px] leading-[22px]"
          >
            Рейтинг
            <span className="text-[13px] leading-4 text-muted">очки и динамика ›</span>
          </Link>

          <Link
            href="/shop"
            className="mt-2 flex min-h-[48px] items-center justify-between card px-4 text-[16px] leading-[22px]"
          >
            Магазин
            <span className="text-[13px] leading-4 text-muted">награды и выдача ›</span>
          </Link>

          <h2 className="mt-7 text-[19px] font-semibold leading-6">Все сотрудники</h2>
          {/* who hears about work only by opening Pulse, by name, a tap on each (D-190) — here with
              the people since the settings' tab lost its roster (owner, 2026-11-25) */}
          <NoPushSummary people={people.data ?? []} push={push.data} me={me.data ? { id: me.data.userId, role: me.data.role } : null} />
          <TeamList people={people.data ?? []} loads={loads.data} pointsOn={pointsOn} />
        </>
      )}
    </main>
  );
}
