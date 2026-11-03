"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DataGrid, type Column, type Group } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Num } from "@/components/desk/ui/Num";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { Avatar } from "@/components/desk/ui/PersonCell";
import { SearchField, Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { useMinute } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import { timeOf } from "@/lib/daily-report/format";
import { useTeamDailyReportDay } from "@/lib/daily-report/queries";
import type { TeamDayRow } from "@/lib/daily-report/types";
import { todayYmd } from "@/lib/datetime/calendar";
import { pointsTone } from "@/lib/desk/format";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { LOAD_COLOR, loadColor, useTeamLoads, type Load } from "@/lib/people/loads";
import { ROLE_LABEL, usePeople, type Person, type Role } from "@/lib/people/queries";
import { useTeamBalances } from "@/lib/points/queries";
import type { Health } from "@/lib/push/health";
import { usePushHealth } from "@/lib/push/health-query";
import { sortByUrgency, useMe, useSentTasks, type TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue, type TaskStatus } from "@/lib/tasks/status-text";

import { HeroBone, DeskHero, type HeroFact } from "./Hero";
import { AwayTag, Dot, GridBone, LoadBar, RING_TONE, ROLE_ORDER, counted, loadWords, matchesPerson } from "./shared";

const NO_LOADS: Record<string, Load> = {};
const NO_BALANCES: Record<string, number> = {};
const NO_TASKS: TaskWithPeople[] = [];
/** What a person is on now: handed in or not sent yet is not «now». */
const NOW_STATUSES: TaskStatus[] = ["sent", "accepted", "in_progress", "rework"];

/** Whose load counts: a person at work, not the wall or a person who left. */
const works = (p: Person) => p.is_active && p.role !== "tv";
/** The director's team: the people who get the work — directors and the wall stand apart. */
const crew = (p: Person) => works(p) && p.role !== "director";
/** «Без уведомлений»: no device, or the last push did not get through (D-114). */
const unreachable = (h: Health | undefined) => h !== undefined && (h.state === "off" || h.state === "broken");

type Filter = "overdue" | "review" | "unreachable" | "away";

const FILTER_LABEL: Record<Filter, string> = {
  overdue: "с просрочкой",
  review: "с работой на приёмке",
  unreachable: "без уведомлений",
  away: "не на месте",
};

/**
 * «Вход» from what the roster already knows without a request per person (tasks/022 B.1): the
 * push channel (D-114) — a device that takes pushes was signed in on. Colour only for trouble;
 * the card tells the rest («Последний вход», the last code).
 */
function LoginCell({ person, health }: { person: Person; health: Health | undefined }) {
  if (!person.is_active) return <span className="text-muted">закрыт</span>;
  if (person.role === "tv") return <span className="text-muted">киоск</span>;
  if (!health) return <span className="text-muted/50">…</span>;
  // the usual is quiet, the trouble reads in plain text — the hero has already counted it
  if (health.state === "ok" || health.state === "idle") {
    return (
      <span className="text-muted" title={`Уведомления: ${health.text}`}>
        на телефоне
      </span>
    );
  }
  if (health.state === "broken") return <Dot tone="warn" title={`Уведомления: ${health.text}`}>пуш не прошёл</Dot>;
  return <span title={`Уведомления: ${health.text}. Вход — в карточке`}>без уведомлений</span>;
}

/** The name, the position after it, «в отпуске» when so — one line, so the row stays 40 px. */
function NameCell({ person, ring }: { person: Person; ring: Tone | null }) {
  const position = person.position && person.position.toLowerCase() !== ROLE_LABEL[person.role].toLowerCase() ? person.position : null;
  return (
    <span className={`flex min-w-0 items-center gap-2.5 ${person.is_active ? "" : "opacity-55"}`}>
      <Avatar name={person.full_name} ring={ring} size={24} />
      <span className="truncate" title={[person.full_name, person.position].filter(Boolean).join(" · ")}>
        {person.full_name}
        {position ? <span className="text-muted"> · {position}</span> : null}
      </span>
      {person.is_active && person.role !== "tv" ? <AwayTag availability={person.availability} /> : null}
    </span>
  );
}

/** The load: the bar and the count in its tone; both lead to the person's tasks — to «Ждут вас» when the move is the director's. */
function LoadCell({ person, load, scale, now }: { person: Person; load: Load | undefined; scale: number; now: number }) {
  const active = load?.active ?? 0;
  if (active === 0) return <span className="text-muted">{person.availability === "active" ? "свободен" : "—"}</span>;
  const color = loadColor(load, person.availability === "active", now);
  const yours = (load?.overdue ?? 0) > 0 || (load?.review ?? 0) > 0;
  return (
    <Link
      href={`/desk/tasks?who=${person.id}${yours ? "&tab=yours" : ""}`}
      className="group/load -mx-1 flex items-center gap-2.5 rounded-[8px] px-1 py-0.5 transition-colors duration-[120ms] hover:bg-surface-2/70"
      title={`${loadWords(load)} — открыть в «Задачах»`}
      data-testid="team-load"
    >
      <LoadBar load={load} scale={scale} />
      <span className="nums font-semibold" style={{ color: LOAD_COLOR[color] }}>
        {active}
      </span>
    </Link>
  );
}

/** What the person is on now: the most urgent open task — late first, then the nearest deadline. */
function NowCell({ task, now }: { task: TaskWithPeople | undefined; now: Date }) {
  if (!task) return <span className="text-muted/40">—</span>;
  const late = isOverdue(task, now);
  return (
    <Link
      href={`/desk/tasks?id=${task.id}`}
      className="-mx-1 flex min-w-0 items-baseline gap-2 rounded-[8px] px-1 py-0.5 transition-colors duration-[120ms] hover:bg-surface-2/70"
      title={task.title}
      data-testid="team-now"
    >
      <span className="min-w-[3.5em] truncate">{task.title}</span>
      {task.deadline ? (
        // today goes without its word — the column is «Сейчас»; the title keeps the room
        <span className="nums shrink-0 text-[13px] leading-5" style={{ color: late ? TONE_VAR.danger : "var(--text-muted)" }}>
          {humanAqtobe(new Date(task.deadline), now).replace(/^сегодня /, "")}
        </span>
      ) : null}
    </Link>
  );
}

/** Today's report: «✓ 18:04» — handed in and when; a quiet dash while it is still due. */
function ReportCell({ person, row }: { person: Person; row: TeamDayRow | undefined }) {
  if (!row || row.state === "off") return null;
  if (row.state === "away") return <span className="text-muted/40">—</span>;
  if (row.state === "submitted") {
    return (
      <Link href={`/desk/reports?p=${person.id}`} className="nums inline-flex items-baseline gap-1.5 rounded-[6px] hover:text-accent" title="Открыть отчёт" data-testid="team-report">
        <span aria-hidden>✓</span>
        <span className="text-muted">{timeOf(row.report?.submitted_at)}</span>
      </Link>
    );
  }
  if (row.state === "missed") return <span style={{ color: TONE_VAR.danger }}>не сдан</span>;
  return <span className="text-muted/50" title="Ещё не сдан">—</span>;
}

type ViewProps = {
  director: boolean;
  people: Person[] | undefined;
  loading: boolean;
  loads: Record<string, Load>;
  balances: Record<string, number>;
  pointsOn: boolean;
  push: Map<string, Health> | undefined;
  tasks: TaskWithPeople[];
  report: Map<string, TeamDayRow> | null;
  now: Date;
};

/**
 * «Команда» on the desk as the dispatcher's board (D-154): the hero says who is here and where
 * the trouble is — each number filters the table; one row a person, 40 px, the troubled first:
 * how loaded (a bar of stages and the count, to their tasks), what they are on now, today's
 * report, the points, whether pushes reach them. Directors and the wall stand apart below; those
 * who left wait at the bottom, grey. The secretary sees the roster only (D-104).
 */
function TeamTableView({ director, people, loading, loads, balances, pointsOn, push, tasks, report, now }: ViewProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [filter, setFilter] = useState<Filter | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const at = now.getTime();

  const all = useMemo(() => people ?? [], [people]);
  const roles = useMemo(() => {
    const present = new Set(all.filter((p) => p.is_active).map((p) => p.role));
    return (Object.keys(ROLE_ORDER) as Role[]).filter((r) => present.has(r)).sort((a, b) => ROLE_ORDER[a] - ROLE_ORDER[b]);
  }, [all]);

  // what each person is on: their most urgent open task, from the director's own orders
  const current = useMemo(() => {
    const map = new Map<string, TaskWithPeople>();
    const open = tasks.filter((task) => NOW_STATUSES.includes(task.status));
    for (const task of sortByUrgency(open, now)) if (!map.has(task.assignee_id)) map.set(task.assignee_id, task);
    return map;
  }, [tasks, now]);

  const load = (p: Person) => (works(p) ? loads[p.id] : undefined);
  const overdueOf = (p: Person) => load(p)?.overdue ?? 0;
  const reviewOf = (p: Person) => load(p)?.review ?? 0;
  const ringOf = (p: Person): Tone | null => (director && works(p) ? RING_TONE[loadColor(load(p), p.availability === "active", at)] : null);
  const scale = Math.max(5, ...all.filter(works).map((p) => loads[p.id]?.active ?? 0));

  const passes = (p: Person): boolean => {
    if (!filter) return true;
    if (!works(p)) return false;
    if (filter === "overdue") return overdueOf(p) > 0;
    if (filter === "review") return reviewOf(p) > 0;
    if (filter === "away") return p.availability !== "active";
    return unreachable(push?.get(p.id));
  };
  const shown = all.filter((p) => (role ? p.role === role : true) && matchesPerson(p, query) && passes(p));
  const byName = (a: Person, b: Person) => a.full_name.localeCompare(b.full_name, "ru");
  // the troubled first: late, then work waiting for the director's «Принято», then by name
  const byTrouble = (a: Person, b: Person) => overdueOf(b) - overdueOf(a) || reviewOf(b) - reviewOf(a) || byName(a, b);
  const groups: Group<Person>[] = [
    { key: "crew", title: null, rows: shown.filter(crew).sort(director ? byTrouble : byName) },
    { key: "heads", title: "Директора и экран", tone: "muted", rows: shown.filter((p) => p.is_active && !crew(p)).sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || byName(a, b)) },
    { key: "gone", title: "Уволенные", tone: "muted", rows: shown.filter((p) => !p.is_active).sort(byName) },
  ];

  const columns: Column<Person>[] = [
    {
      key: "name",
      title: "Имя",
      width: director ? "minmax(180px,1.25fr)" : "minmax(220px,1fr)",
      sort: byName,
      render: (p) => <NameCell person={p} ring={ringOf(p)} />,
    },
  ];
  if (!director) {
    columns.push({
      key: "role",
      title: "Роль",
      width: "minmax(132px,180px)",
      sort: (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || byName(a, b),
      render: (p) => <span className={p.is_active ? "" : "text-muted"}>{ROLE_LABEL[p.role]}</span>,
    });
  }
  if (director) {
    columns.push(
      {
        key: "load",
        title: "Нагрузка",
        width: "132px",
        sort: (a, b) => overdueOf(a) - overdueOf(b) || reviewOf(a) - reviewOf(b) || (load(a)?.active ?? 0) - (load(b)?.active ?? 0),
        // a director gets no orders: a dash unless somebody gave them one
        render: (p) =>
          crew(p) || (works(p) && (load(p)?.active ?? 0) > 0) ? <LoadCell person={p} load={load(p)} scale={scale} now={at} /> : <span className="text-muted/40">—</span>,
      },
      {
        key: "now",
        title: "Сейчас",
        // what they are on gives way first on a narrower window: the title truncates
        width: "minmax(0,1.5fr)",
        // the undated last, whichever way
        sort: (a, b) => (current.get(a.id)?.deadline ?? "9999").localeCompare(current.get(b.id)?.deadline ?? "9999"),
        render: (p) => (crew(p) || current.has(p.id) ? <NowCell task={current.get(p.id)} now={now} /> : null),
      },
    );
    if (report) {
      columns.push({
        key: "report",
        title: "Отчёт",
        width: "92px",
        sort: (a, b) => (report.get(a.id)?.report?.submitted_at ?? "~").localeCompare(report.get(b.id)?.report?.submitted_at ?? "~"),
        render: (p) => <ReportCell person={p} row={report.get(p.id)} />,
      });
    }
    if (pointsOn) {
      columns.push({
        key: "points",
        title: "Очки",
        width: "96px",
        align: "right",
        sort: (a, b) => (balances[a.id] ?? 0) - (balances[b.id] ?? 0),
        // the director and the wall play no game (the phone's roster rule)
        render: (p) => {
          if (!crew(p)) return <span className="text-muted/40">—</span>;
          const value = balances[p.id] ?? 0;
          return <Num value={value} tone={pointsTone(value)} className="font-semibold" />;
        },
      });
    }
  }
  columns.push({
    key: "login",
    title: "Вход",
    width: "minmax(124px,160px)",
    sort: (a, b) => Number(unreachable(push?.get(a.id))) - Number(unreachable(push?.get(b.id))) || byName(a, b),
    render: (p) => <LoginCell person={p} health={push?.get(p.id)} />,
  });

  // the hero: who is here, and the trouble — each number a filter of the table
  const staff = all.filter(works);
  const present = staff.filter((p) => p.availability === "active").length;
  const away = staff.length - present;
  const lateCount = staff.filter((p) => overdueOf(p) > 0).length;
  const reviewCount = staff.filter((p) => reviewOf(p) > 0).length;
  const deaf = push ? staff.filter((p) => unreachable(push.get(p.id))).length : 0;
  const open = staff.reduce((sum, p) => sum + (loads[p.id]?.active ?? 0), 0);
  const worst: Tone | null = loading ? null : lateCount > 0 ? "danger" : reviewCount > 0 || deaf > 0 ? "warn" : "ok";
  const toggle = (next: Filter) => () => setFilter((was) => (was === next ? null : next));
  // a trouble that is not there takes no room: the line under the figure says «просрочек нет»
  const trouble = (key: Filter, value: number, label: string, tone: Tone | null): HeroFact[] =>
    value > 0 || filter === key ? [{ key, value, label, tone, onClick: toggle(key), active: filter === key, title: filter === key ? "Показать всех" : "Показать только их" }] : [];
  const facts: HeroFact[] = director
    ? [
        ...trouble("overdue", lateCount, "с просрочкой", "danger"),
        ...trouble("review", reviewCount, "на приёмке", "warn"),
        ...trouble("unreachable", deaf, "без уведомлений", "warn"),
        { key: "open", value: open, label: "задач в работе", href: "/desk/tasks?tab=working", title: "Открыть «Задачи»" },
      ]
    : [...trouble("unreachable", deaf, "без уведомлений", "warn"), ...trouble("away", away, "не на месте", null)];
  const calm = director && lateCount === 0 && reviewCount === 0 ? "просрочек нет" : null;
  const sub = [away > 0 ? `из ${counted(staff.length, ["человека", "человек", "человек"])} · ${counted(away, ["отсутствует", "отсутствуют", "отсутствуют"])}` : "вся команда", calm]
    .filter(Boolean)
    .join(" · ");

  const openCard = (id: string) => router.push(`/desk/team/${id}`);
  const count = shown.filter((p) => p.is_active).length;
  const narrowed = Boolean(query || role || filter);

  return (
    <DeskPage>
      <PageTitle
        title="Команда"
        light={worst}
        actions={
          <Link href="/desk/team/new" data-testid="desk-team-new">
            <Button size="sm">Новый сотрудник</Button>
          </Link>
        }
      />
      {loading ? (
        <HeroBone />
      ) : (
        <DeskHero
          testId="desk-team-hero"
          value={present}
          title="на месте"
          sub={sub}
          facts={facts}
        />
      )}
      <Toolbar
        end={
          <span className="nums text-[13px] leading-4 text-muted">
            {loading ? " " : filter ? `${FILTER_LABEL[filter]}: ${count}` : counted(count, ["человек", "человека", "человек"])}
          </span>
        }
      >
        <SearchField value={query} onChange={setQuery} placeholder="Имя, должность или как зовут в речи" width={320} aria-label="Поиск по команде" />
        <Select value={role} onChange={(event) => setRole(event.target.value as Role | "")} aria-label="Роль" data-testid="desk-team-role">
          <option value="">Все роли</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
        {filter ? (
          <button
            type="button"
            onClick={() => setFilter(null)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-accent/50 bg-accent/10 px-3 text-[13px] font-semibold leading-4 text-text transition-colors duration-[120ms] hover:bg-accent/15"
            data-testid="desk-team-filter"
          >
            {FILTER_LABEL[filter]}
            <span aria-hidden className="text-muted">
              ×
            </span>
          </button>
        ) : null}
      </Toolbar>
      {loading ? (
        <GridBone columns={director ? 6 : 3} />
      ) : (
        <div data-testid="desk-team-table">
          <DataGrid
            aria-label="Команда"
            columns={columns}
            groups={groups}
            rowKey={(p) => p.id}
            selectedKey={selected}
            onSelect={(p) => setSelected(p.id)}
            onActivate={(p) => openCard(p.id)}
            // a click anywhere on a row opens the card; the load and the task in it lead on their own
            onRowClick={(p) => openCard(p.id)}
            empty={
              <EmptyState
                tone={filter && !query && !role ? "ok" : undefined}
                title={filter && !query && !role ? `Никого ${FILTER_LABEL[filter]}` : narrowed ? "Никого не нашлось" : "В команде пока никого"}
                hint={
                  filter
                    ? "Фильтр снимается повторным нажатием на число сверху"
                    : narrowed
                      ? "Поиск — по имени, должности и тому, как человека зовут в речи"
                      : "Добавьте первого — он войдёт по коду из 8 цифр"
                }
                action={
                  narrowed ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setFilter(null);
                        setQuery("");
                        setRole("");
                      }}
                    >
                      Показать всех
                    </Button>
                  ) : null
                }
              />
            }
          />
        </div>
      )}
    </DeskPage>
  );
}

/** The director's board: loads, what each is on, today's reports and points come with it. */
function DirectorTeam() {
  const { pointsEnabled } = useDeskScope();
  const now = useMinute();
  const me = useMe();
  const people = usePeople();
  const loads = useTeamLoads();
  const balances = useTeamBalances(pointsEnabled);
  const push = usePushHealth();
  const sent = useSentTasks(me.data?.userId);
  // reports switched off for the company: no column, and no call that would only be refused
  const settings = useCompanySettings();
  const reportsOn = settings.data ? settings.data.daily_report.enabled : undefined;
  const day = useTeamDailyReportDay(todayYmd(now), me.data?.companyId, reportsOn === true);
  const report = useMemo(() => (day.data ? new Map(day.data.rows.map((row) => [row.user_id, row])) : null), [day.data]);
  return (
    <TeamTableView
      director
      people={people.data}
      loading={people.isLoading || loads.isLoading}
      loads={loads.data ?? NO_LOADS}
      balances={balances.data ?? NO_BALANCES}
      pointsOn={pointsEnabled}
      push={push.data}
      tasks={sent.data ?? NO_TASKS}
      report={reportsOn === false || day.isError ? null : (report ?? new Map())}
      now={now}
    />
  );
}

/** The secretary's: the roster only — nobody's tasks or points are hers to read (D-104). */
function SecretaryTeam() {
  const now = useMinute();
  const people = usePeople();
  const push = usePushHealth();
  return (
    <TeamTableView
      director={false}
      people={people.data}
      loading={people.isLoading}
      loads={NO_LOADS}
      balances={NO_BALANCES}
      pointsOn={false}
      push={push.data}
      tasks={NO_TASKS}
      report={null}
      now={now}
    />
  );
}

export function TeamTable() {
  const { role } = useDeskScope();
  return role === "director" ? <DirectorTeam /> : <SecretaryTeam />;
}
