"use client";

import { NoPushSummary } from "@/components/people/NoPushSummary";
import { TeamRoster } from "@/components/people/TeamRoster";
import { HeadButton } from "@/components/ui/HeadButton";
import { PageHead } from "@/components/ui/PageHead";
import { TeamListBone } from "@/components/ui/PageSkeletons";
import { usePeople } from "@/lib/people/queries";
import { countTeam } from "@/lib/people/team";
import { usePushHealth } from "@/lib/push/health-query";
import { pluralRu } from "@/lib/tasks/status-text";
import { useMe } from "@/lib/tasks/queries";

/**
 * «Команда» of the secretary (D-104): the roster she runs — who holds which role, a tap opens the
 * person's editor; who does not hear about work, by name (D-190). No load board: she reads nobody's
 * tasks, so it would show her an idle company. The people's one place on the phone, as «Команда» is
 * the director's (the settings tab «Очки и отчёты» only leads here, owner 2026-11-25).
 */
export function RosterScreen() {
  const people = usePeople();
  const me = useMe();
  const push = usePushHealth();
  const who = me.data ? { id: me.data.userId, role: me.data.role } : null;
  // the team as every screen counts it (lib/people/team.ts)
  const team = countTeam(people.data ?? []);
  const summary = people.isLoading ? " " : team.team === 0 ? "В команде пока никого" : `${team.team} ${pluralRu(team.team, ["человек", "человека", "человек"])} в команде`;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead
        title="Команда"
        tone="muted"
        state={<span className="nums">{summary}</span>}
        actions={<HeadButton label="Добавить сотрудника" icon="plus" tone="accent" href="/people/new" />}
      />
      <NoPushSummary people={people.data ?? []} push={push.data} me={who} />
      {people.isLoading ? <TeamListBone /> : <TeamRoster people={people.data ?? []} me={who} push={push.data} />}
    </main>
  );
}
