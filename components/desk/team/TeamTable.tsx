"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DataGrid, type Column, type Group } from "@/components/desk/ui/DataGrid";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { useContextMenu, type MenuItem } from "@/components/desk/ui/Menu";
import { Num } from "@/components/desk/ui/Num";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SearchField, Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { When } from "@/components/desk/ui/When";
import { useMinute } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { timeOf } from "@/lib/daily-report/format";
import { useTeamDailyReportDay } from "@/lib/daily-report/queries";
import type { TeamDayRow } from "@/lib/daily-report/types";
import { todayYmd } from "@/lib/datetime/calendar";
import { pointsTone } from "@/lib/desk/format";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { canChangeAccess, canEditPerson, canResetLogin, type Who } from "@/lib/people/access";
import { usePhones, useSetWorking } from "@/lib/people/card-queries";
import { useTeamLoads, type Load } from "@/lib/people/loads";
import { ROLE_LABEL, isTeamMember, usePeople, type Person, type Role } from "@/lib/people/queries";
import { useTeamBalances } from "@/lib/points/queries";
import type { Health } from "@/lib/push/health";
import { usePushHealth } from "@/lib/push/health-query";
import { useComposeStore } from "@/lib/store/compose";
import { sortByUrgency, useMe, useSentTasks, type TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue, type TaskStatus } from "@/lib/tasks/status-text";

import { HeroBone, DeskHero, type HeroFact } from "./Hero";
import { arrowOf, onControl, stepKey, useScreenKeys } from "./keys";
import { PersonPeek } from "./PersonPeek";
import { RemoveDialog, type RemoveMode } from "./RemoveDialog";
import { AwayTag, GridBone, LoadTally, ROLE_ORDER, StateWord, addressOf, counted, loadWords, matchesPerson, tidy, useBoxWidth } from "./shared";

const NO_LOADS: Record<string, Load> = {};
const NO_BALANCES: Record<string, number> = {};
const NO_TASKS: TaskWithPeople[] = [];
/** What a person is on now: handed in or not sent yet is not «now». */
const NOW_STATUSES: TaskStatus[] = ["sent", "accepted", "in_progress", "rework"];
/** Their open work in the peek: also what waits for the director's «Принято» and what is not sent yet. */
const OPEN_STATUSES: TaskStatus[] = [...NOW_STATUSES, "pending_review", "scheduled"];
/** Below this width of the table a column steps aside, the least needed first (the panel open, a narrow window). */
const ROOM: Partial<Record<string, number>> = { login: 900, report: 800, points: 720 };
const ROWS = '[data-testid="desk-team-table"] [data-row-key]';

/** Whose load counts: a person at work, not the wall or a person who left. */
const works = (p: Person) => p.is_active && p.role !== "tv";
/** The director's team: the people who get the work — directors and the wall stand apart. */
const crew = (p: Person) => works(p) && p.role !== "director";
/** «Без уведомлений»: no device, or the last push did not get through (D-114). */
const unreachable = (h: Health | undefined) => h !== undefined && (h.state === "off" || h.state === "broken");

type Filter = "overdue" | "review" | "unreachable" | "away" | "left";

const FILTER_LABEL: Record<Filter, string> = {
  overdue: "с просрочкой",
  review: "с работой на приёмке",
  unreachable: "без уведомлений",
  away: "не на месте",
  left: "ушедшие с задачами",
};

/**
 * «Вход» from what the roster already knows without a request per person (tasks/022 B.1): the
 * push channel (D-114) — a device that takes pushes was signed in on. The red pencil only for a
 * push that failed; the card tells the rest («Последний вход», the last code).
 */
function LoginCell({ person, health }: { person: Person; health: Health | undefined }) {
  if (!person.is_active) return <span className="text-muted">вход закрыт</span>;
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
  if (health.state === "broken") {
    return (
      <StateWord tone="danger" title={`Уведомления: ${health.text}`}>
        пуш не прошёл
      </StateWord>
    );
  }
  return <span title={`Уведомления: ${health.text}. Вход — в карточке`}>не включены</span>;
}

/** The name, the position after it, «в отпуске» when so — one line, so the row stays 34 px. */
function NameCell({ person }: { person: Person }) {
  const position = person.position && person.position.toLowerCase() !== ROLE_LABEL[person.role].toLowerCase() ? person.position : null;
  return (
    <span className={`flex min-w-0 items-baseline gap-2.5 ${person.is_active ? "" : "opacity-55"}`}>
      <span className="truncate" title={[person.full_name, person.position].filter(Boolean).join(" · ")}>
        {person.full_name}
        {position ? <span className="text-muted"> · {position}</span> : null}
      </span>
      {person.is_active && person.role !== "tv" ? <AwayTag availability={person.availability} /> : null}
    </span>
  );
}

/**
 * The load: the count and its tally, both lead to the person's tasks — to «Ждут вас» when the move
 * is the director's. The red pencil for what is late, the pen for what waits for him; a deadline
 * merely close is nobody's move yet (D-158).
 */
function LoadCell({ person, load, scale }: { person: Person; load: Load | undefined; scale: number }) {
  const active = load?.active ?? 0;
  if (active === 0) return <span className="text-muted">{person.availability === "active" ? "свободен" : "—"}</span>;
  const late = (load?.overdue ?? 0) > 0;
  const waits = (load?.review ?? 0) > 0;
  const tone = late ? TONE_VAR.danger : waits ? TONE_VAR.warn : undefined;
  return (
    <Link href={`/desk/tasks?who=${person.id}${late || waits ? "&tab=yours" : ""}`} className="flex items-center gap-2.5" title={`${loadWords(load)} — открыть в «Задачах»`} data-testid="team-load">
      <span className="nums w-5 text-right" style={tone ? { color: tone } : undefined}>
        {active}
      </span>
      <LoadTally load={load} scale={scale} />
    </Link>
  );
}

/** What the person is on now: the most urgent open task — late first, then the nearest deadline. */
function NowCell({ task, now }: { task: TaskWithPeople | undefined; now: Date }) {
  if (!task) return <span className="text-muted/40">—</span>;
  const late = isOverdue(task, now);
  return (
    <Link href={`/desk/tasks?id=${task.id}`} className="flex min-w-0 items-baseline gap-2 hover:underline" title={task.title} data-testid="team-now">
      <span className="min-w-[3.5em] truncate">{task.title}</span>
      {task.deadline ? (
        // today goes without its word — the column is «Сейчас»; the title keeps the room
        <When overdue={late} className="shrink-0 text-[13px] leading-5 text-muted">
          {humanAqtobe(new Date(task.deadline), now).replace(/^сегодня /, "")}
        </When>
      ) : null}
    </Link>
  );
}

/** Today's report: «18:04» — when it was handed in; a quiet dash while it is still due. */
function ReportCell({ person, row }: { person: Person; row: TeamDayRow | undefined }) {
  if (!row || row.state === "off") return null;
  if (row.state === "away") return <span className="text-muted/40">—</span>;
  if (row.state === "submitted") {
    return (
      <Link href={`/desk/reports?p=${person.id}`} className="hover:underline" title="Открыть отчёт" data-testid="team-report">
        <When className="text-muted">{timeOf(row.report?.submitted_at)}</When>
      </Link>
    );
  }
  if (row.state === "missed") return <StateWord tone="danger">не сдан</StateWord>;
  return <span className="text-muted/50" title="Ещё не сдан">—</span>;
}

type ViewProps = {
  director: boolean;
  /** The viewer: what they may do to a row (lib/people/access). */
  me: Who | null;
  people: Person[] | undefined;
  loading: boolean;
  /** Something the screen stands on did not come: it says so instead of drawing zeros. */
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
  loads: Record<string, Load>;
  balances: Record<string, number>;
  pointsOn: boolean;
  push: Map<string, Health> | undefined;
  tasks: TaskWithPeople[];
  report: Map<string, TeamDayRow> | null;
  now: Date;
};

/**
 * «Команда» on the desk as the dispatcher's board (D-154, D-158): the total says who is here and
 * where the trouble is — each number filters the table; one row a person, 34 px, the troubled
 * first: how loaded (the count and its tally, to their tasks), what they are on now, today's
 * report, the points, whether pushes reach them. Directors and the wall stand apart below; those
 * who left are «Ушедшие» — out of sight until asked for (the toolbar's «Ушедшие · N», a search,
 * or the hero's «задач у ушедших» when someone left with work on them, D-160). The secretary sees
 * the roster only (D-104).
 *
 * Worked with a mouse and the keys (wave 3): a click peeks at the person in the right-hand panel
 * (`?p=`), the table stays; a double click or Enter opens the card; the right button — every move
 * of the row; ↑/↓ choose (the panel follows), Space peeks, E edits, T gives a task, Delete
 * removes (D-160: one «Удалить…» for everybody, the dialog says what it does), N — a new person,
 * F — the search. `?p=<id>&remove=1` opens the dialog — the order line's «удалить Ерлана».
 */
function TeamTableView({ director, me, people, loading, failed, retrying, onRetry, loads, balances, pointsOn, push, tasks, report, now }: ViewProps) {
  const router = useRouter();
  const setWorking = useSetWorking();
  const [removing, setRemoving] = useState<{ person: Person; mode: RemoveMode } | null>(null);
  const params = useSearchParams();
  const openId = params.get("p");
  const [showGone, setShowGone] = useState(false);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [filter, setFilter] = useState<Filter | null>(null);
  const [selected, setSelected] = useState<string | null>(openId);
  const search = useRef<HTMLInputElement>(null);
  const menu = useContextMenu();
  const [box, width] = useBoxWidth();
  const phones = usePhones();

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
  const scale = Math.max(5, ...all.filter(works).map((p) => loads[p.id]?.active ?? 0));

  const heldByGone = (p: Person) => (!p.is_active && p.role !== "tv" ? (loads[p.id]?.active ?? 0) : 0);
  const passes = (p: Person): boolean => {
    if (!filter) return true;
    if (filter === "left") return heldByGone(p) > 0;
    if (!works(p)) return false;
    if (filter === "overdue") return overdueOf(p) > 0;
    if (filter === "review") return reviewOf(p) > 0;
    if (filter === "away") return p.availability !== "active";
    return unreachable(push?.get(p.id));
  };
  const shown = all.filter((p) => (role ? p.role === role : true) && matchesPerson(p, query, phones.data?.[p.id]) && passes(p));
  // who left: in sight when asked for — the toolbar, a search, a filter that is about them
  const goneInSight = showGone || Boolean(query) || filter === "left";
  const goneCount = all.filter((p) => !p.is_active).length;
  const byName = (a: Person, b: Person) => a.full_name.localeCompare(b.full_name, "ru");
  // the troubled first: late, then work waiting for the director's «Принято», then by name
  const byTrouble = (a: Person, b: Person) => overdueOf(b) - overdueOf(a) || reviewOf(b) - reviewOf(a) || byName(a, b);
  const groups: Group<Person>[] = [
    { key: "crew", title: null, rows: shown.filter(crew).sort(director ? byTrouble : byName) },
    { key: "heads", title: "Директора и экран", tone: "muted", rows: shown.filter((p) => p.is_active && !crew(p)).sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || byName(a, b)) },
    { key: "gone", title: "Ушедшие", tone: "muted", rows: goneInSight ? shown.filter((p) => !p.is_active).sort(byName) : [] },
  ];

  const columns: Column<Person>[] = [
    {
      key: "name",
      title: "Имя",
      width: director ? "minmax(180px,1.25fr)" : "minmax(220px,1fr)",
      sort: byName,
      render: (p) => <NameCell person={p} />,
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
        // a director gets no orders: a dash unless somebody gave them one; who left shows only what is still on them
        render: (p) => {
          const held = loads[p.id]?.active ?? 0;
          if (!p.is_active && held > 0) return <LoadCell person={p} load={loads[p.id]} scale={scale} />;
          return crew(p) || (works(p) && held > 0) ? <LoadCell person={p} load={load(p)} scale={scale} /> : <span className="text-muted/40">—</span>;
        },
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
          return <Num value={value} tone={pointsTone(value)} />;
        },
      });
    }
  }
  columns.push({
    key: "login",
    title: "Уведомления",
    width: "minmax(124px,160px)",
    sort: (a, b) => Number(unreachable(push?.get(a.id))) - Number(unreachable(push?.get(b.id))) || byName(a, b),
    render: (p) => <LoginCell person={p} health={push?.get(p.id)} />,
  });

  // the hero: who is here, and the trouble — each number a filter of the table
  const staff = all.filter(isTeamMember);
  const present = staff.filter((p) => p.availability === "active").length;
  const away = staff.length - present;
  const lateCount = staff.filter((p) => overdueOf(p) > 0).length;
  const reviewCount = staff.filter((p) => reviewOf(p) > 0).length;
  const deaf = push ? staff.filter((p) => unreachable(push.get(p.id))).length : 0;
  // work still on people who left: nobody does it — the director hands it over (D-160)
  const orphaned = all.reduce((sum, p) => sum + heldByGone(p), 0);
  const open = staff.reduce((sum, p) => sum + (loads[p.id]?.active ?? 0), 0);
  const toggle = (next: Filter) => () => setFilter((was) => (was === next ? null : next));
  // a trouble that is not there takes no room: the line under the figure says «просрочек нет»
  const trouble = (key: Filter, value: number, label: string, tone: Tone | null): HeroFact[] =>
    value > 0 || filter === key ? [{ key, value, label, tone, onClick: toggle(key), active: filter === key, title: filter === key ? "Показать всех" : "Показать только их" }] : [];
  const facts: HeroFact[] = director
    ? [
        ...trouble("left", orphaned, orphaned === 1 ? "задача у ушедших" : "задач у ушедших", "danger"),
        ...trouble("overdue", lateCount, "с просрочкой", "danger"),
        ...trouble("review", reviewCount, "на приёмке", "warn"),
        ...trouble("unreachable", deaf, "без уведомлений", null),
        { key: "open", value: open, label: "открытых задач", href: "/desk/tasks", title: "Открыть «Задачи»" },
      ]
    : [...trouble("unreachable", deaf, "без уведомлений", null), ...trouble("away", away, "не на месте", null)];
  const calm = director && lateCount === 0 && reviewCount === 0 ? "просрочек нет" : null;
  const sub = [away > 0 ? `из ${counted(staff.length, ["человека", "человек", "человек"])} · ${counted(away, ["отсутствует", "отсутствуют", "отсутствуют"])}` : "вся команда", calm]
    .filter(Boolean)
    .join(" · ");

  /* ---- the moves of a row: the peek, the card, the menu and the letters say the same ---- */
  const peek = (id: string | null) => router.replace(id ? `/desk/team?p=${id}` : "/desk/team", { scroll: false });
  const choose = (id: string) => {
    setSelected(id);
    // the panel follows the choice while it is open
    if (openId && openId !== id) peek(id);
  };
  const openCard = (id: string) => router.push(`/desk/team/${id}`);
  const byId = (id: string | null) => (id ? (all.find((p) => p.id === id) ?? null) : null);
  // a director gets no orders here, and nobody gives one to themselves
  const givable = (p: Person) => director && works(p) && p.role !== "director" && p.id !== me?.id;
  const editable = (p: Person) => (me ? canEditPerson(me, p) : false);
  const give = (p: Person) => useComposeStore.getState().request("", { id: p.id, name: p.full_name, address: addressOf(p) });
  const edit = (p: Person) => router.push(`/desk/team/${p.id}?edit=1`);
  const menuOf = (p: Person): MenuItem[] => {
    const items: MenuItem[] = [
      { key: "open", label: "Открыть карточку", hint: "Enter", onSelect: () => openCard(p.id) },
      { key: "peek", label: openId === p.id ? "Закрыть панель" : "Посмотреть в панели", hint: "Space", onSelect: () => peek(openId === p.id ? null : p.id) },
    ];
    if (givable(p)) items.push({ key: "give", label: "Дать задачу", hint: "T", onSelect: () => give(p) });
    if (director && works(p)) items.push({ key: "tasks", label: "Задачи человека", onSelect: () => router.push(`/desk/tasks?who=${p.id}`) });
    if (editable(p)) items.push({ key: "edit", label: "Изменить", hint: "E", onSelect: () => edit(p) });
    // the code itself is issued on the card, in front of the person — the menu only leads there
    if (me && p.is_active && canResetLogin(me, p)) items.push("separator", { key: "login", label: "Выдать код входа…", onSelect: () => router.push(`/desk/team/${p.id}?login=1`) });
    if (me && canChangeAccess(me, p)) {
      const kiosk = p.role === "tv";
      if (p.is_active) items.push("separator", { key: "remove", label: kiosk ? "Выключить экран…" : "Удалить…", hint: "Del", danger: true, onSelect: () => remove(p) });
      else {
        items.push("separator");
        if (director && (loads[p.id]?.active ?? 0) > 0) items.push({ key: "pass", label: "Передать задачи…", onSelect: () => setRemoving({ person: p, mode: "pass" }) });
        items.push({ key: "revive", label: kiosk ? "Включить экран" : "Вернуть в команду", onSelect: () => revive(p) });
        items.push({ key: "erase", label: "Удалить насовсем…", hint: "Del", danger: true, onSelect: () => remove(p) });
      }
    }
    return items;
  };
  /** «Удалить…» of a person at work, «Удалить насовсем…» of one who left — the same key for both. */
  const removable = (p: Person) => Boolean(me && canChangeAccess(me, p));
  const remove = (p: Person) => setRemoving({ person: p, mode: p.is_active ? "remove" : "erase" });
  const revive = (p: Person) =>
    setWorking.mutate(
      { id: p.id, working: true },
      {
        onSuccess: () => toast(p.role === "tv" ? `Экран «${p.full_name}» включён` : `${p.full_name} снова в команде. Вход — по новому коду`),
        onError: (error) => toast(error.message),
      },
    );

  /* ---- the keys: by the physical key, never while a field or a menu has them ---- */
  const chosenId = selected ?? openId;
  useScreenKeys((event) => {
    const arrow = arrowOf(event);
    if (arrow) {
      // the order on screen, after the table's own sort
      const keys = [...document.querySelectorAll<HTMLElement>(ROWS)].map((row) => row.dataset.rowKey ?? "");
      const next = stepKey(keys, chosenId, arrow === "down");
      if (next) choose(next);
      return Boolean(next);
    }
    if (event.code === "KeyN") {
      router.push("/desk/team/new");
      return true;
    }
    if (event.code === "KeyF") {
      search.current?.focus();
      return true;
    }
    const person = byId(chosenId);
    if (!person) return false;
    if ((event.code === "Enter" || event.code === "NumpadEnter") && !onControl(event.target)) {
      openCard(person.id);
      return true;
    }
    if (event.code === "Space" && !onControl(event.target)) {
      peek(openId === person.id ? null : person.id);
      return true;
    }
    if (event.code === "KeyE" && editable(person)) {
      edit(person);
      return true;
    }
    if (event.code === "KeyT" && givable(person)) {
      give(person);
      return true;
    }
    if ((event.code === "Delete" || event.code === "Backspace") && removable(person)) {
      remove(person);
      return true;
    }
    return false;
  });
  // the order line's «удалить Ерлана» lands here with the person and the dialog asked for: the
  // address holds the question until the dialog closes
  const asked = params.get("remove") === "1" ? byId(openId) : null;
  const dialog: { person: Person; mode: RemoveMode } | null = removing ?? (asked && removable(asked) ? { person: asked, mode: asked.is_active ? "remove" : "erase" } : null);
  const closeDialog = () => {
    setRemoving(null);
    if (asked) router.replace(`/desk/team?p=${asked.id}`, { scroll: false });
  };
  useShortcuts("Команда", [
    { keys: ["↑", "↓"], label: "Выбрать человека" },
    { keys: ["Space"], label: "Посмотреть в панели" },
    { keys: ["Enter"], label: "Открыть карточку" },
    { keys: ["E"], label: "Изменить карточку" },
    ...(director ? [{ keys: ["T"], label: "Дать задачу" }] : []),
    { keys: ["Del"], label: "Удалить (у ушедшего — насовсем)" },
    { keys: ["N"], label: "Новый сотрудник" },
    { keys: ["F"], label: "Поиск по команде" },
  ]);

  const count = shown.filter((p) => p.is_active).length;
  const narrowed = Boolean(query || role || filter);
  const opened = failed ? null : byId(openId);
  const chosen = byId(chosenId);
  const managerOf = (p: Person) => byId(p.manager_id);
  const openTasksOf = (id: string) => sortByUrgency(tasks.filter((task) => task.assignee_id === id && OPEN_STATUSES.includes(task.status)), now);
  const visibleColumns = columns.filter((column) => width === 0 || width >= (ROOM[column.key] ?? 0));

  return (
    <DeskPage>
      <PageTitle
        title="Команда"
        actions={
          <Tooltip label="Добавить человека" keys={["N"]} side="bottom">
            <Button size="sm" onClick={() => router.push("/desk/team/new")} data-testid="desk-team-new">
              Новый сотрудник
            </Button>
          </Tooltip>
        }
      />
      {failed ? (
        <EmptyState
          title="Не смог загрузить команду"
          hint="Проверьте связь и попробуйте ещё раз"
          action={
            <Button size="sm" variant="secondary" loading={retrying} onClick={onRetry} data-testid="desk-team-retry">
              Повторить
            </Button>
          }
        />
      ) : loading ? (
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
      {failed ? null : <Toolbar
        end={
          <span className="nums text-[13px] leading-4 text-muted">
            {loading ? " " : filter ? `${FILTER_LABEL[filter]}: ${count}` : counted(query || role ? count : staff.length, ["человек", "человека", "человек"])}
          </span>
        }
      >
        <SearchField ref={search} value={query} onChange={setQuery} placeholder="Имя, должность или как зовут в речи  ·  F" width={340} aria-label="Поиск по команде" />
        <Select value={role} onChange={(event) => setRole(event.target.value as Role | "")} aria-label="Роль" data-testid="desk-team-role">
          <option value="">Все роли</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
        {goneCount > 0 && !query && filter !== "left" ? (
          <button
            type="button"
            onClick={() => setShowGone((was) => !was)}
            aria-pressed={showGone}
            className={`inline-flex h-8 items-center gap-1.5 text-[14px] leading-5 hover:underline ${showGone ? "text-accent" : "text-muted"}`}
            data-testid="desk-team-gone"
          >
            Ушедшие · <span className="nums">{goneCount}</span>
            {showGone ? <span aria-hidden>×</span> : null}
          </button>
        ) : null}
        {filter ? (
          <button
            type="button"
            onClick={() => setFilter(null)}
            className="inline-flex h-8 items-center gap-1.5 text-[14px] leading-5 text-accent hover:underline"
            data-testid="desk-team-filter"
          >
            {FILTER_LABEL[filter]}
            <span aria-hidden>×</span>
          </button>
        ) : null}
      </Toolbar>}
      {failed ? null : loading ? (
        <GridBone columns={director ? 6 : 3} />
      ) : (
        <div
          ref={box}
          data-testid="desk-team-table"
          // the right button on a row: its moves at the cursor, the row chosen under them
          onContextMenu={(event) => {
            const person = byId((event.target as HTMLElement).closest<HTMLElement>("[data-row-key]")?.dataset.rowKey ?? null);
            if (!person) return;
            // the row under the cursor is chosen, as in a file list — the panel follows when open
            choose(person.id);
            menu.open(event, menuOf(person));
          }}
        >
          <DataGrid
            aria-label="Команда"
            columns={visibleColumns}
            groups={groups}
            rowKey={(p) => p.id}
            selectedKey={chosenId}
            onSelect={(p) => choose(p.id)}
            onActivate={(p) => openCard(p.id)}
            // a click peeks in the panel, the table stays; the load and the task in a row lead on their own
            onRowClick={(p) => peek(p.id)}
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

      {shown.length > 0 && !failed ? (
        // the moves of the chosen row only — a hint never names a key that does nothing here
        <p className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-4 text-muted" data-testid="desk-keys-hint">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> выбор
          </span>
          <span>
            <Kbd>Space</Kbd> в панели
          </span>
          <span>
            <Kbd>Enter</Kbd> карточка
          </span>
          {chosen && editable(chosen) ? (
            <span>
              <Kbd>E</Kbd> изменить
            </span>
          ) : null}
          {chosen && givable(chosen) ? (
            <span>
              <Kbd>T</Kbd> дать задачу
            </span>
          ) : null}
          {chosen && removable(chosen) ? (
            <span>
              <Kbd>Del</Kbd> {chosen.is_active ? "удалить" : "удалить насовсем"}
            </span>
          ) : null}
          <span>правая кнопка — все действия</span>
        </p>
      ) : null}

      {opened ? (
        <InPanel panelKey={`person:${opened.id}`} onClose={() => peek(null)}>
          <PersonPeek
            person={opened}
            manager={managerOf(opened)}
            director={director}
            load={load(opened)}
            tasks={director ? openTasksOf(opened.id) : NO_TASKS}
            report={report?.get(opened.id)}
            balance={pointsOn && crew(opened) ? (balances[opened.id] ?? 0) : null}
            push={push?.get(opened.id)}
            now={now}
            moves={{
              give: givable(opened) ? () => give(opened) : undefined,
              edit: editable(opened) ? () => edit(opened) : undefined,
              open: () => openCard(opened.id),
              more: tidy(menuOf(opened).filter((item) => item === "separator" || !["open", "peek", "give", "edit"].includes(item.key))),
            }}
          />
        </InPanel>
      ) : null}
      {menu.node}
      {dialog ? (
        <RemoveDialog
          person={dialog.person}
          roster={all}
          director={director}
          mode={dialog.mode}
          onClose={closeDialog}
          // the row is gone from the team: the panel does not stay on it
          onDone={() => (openId === dialog.person.id ? peek(null) : undefined)}
        />
      ) : null}
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
  // stale data stays on a failed refresh; only what never came breaks the screen
  const failed = people.isLoadingError || loads.isLoadingError || sent.isLoadingError;
  return (
    <TeamTableView
      director
      me={me.data ? { id: me.data.userId, role: me.data.role } : null}
      people={people.data}
      loading={people.isLoading || loads.isLoading}
      failed={failed}
      retrying={people.isFetching || loads.isFetching || sent.isFetching}
      onRetry={() => {
        void people.refetch();
        void loads.refetch();
        void sent.refetch();
      }}
      loads={loads.data ?? NO_LOADS}
      balances={balances.data ?? NO_BALANCES}
      // no points came: no column, rather than a zero for everyone
      pointsOn={pointsEnabled && !balances.isLoadingError}
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
  const me = useMe();
  const people = usePeople();
  const push = usePushHealth();
  return (
    <TeamTableView
      director={false}
      me={me.data ? { id: me.data.userId, role: me.data.role } : null}
      people={people.data}
      loading={people.isLoading}
      failed={people.isLoadingError}
      retrying={people.isFetching}
      onRetry={() => void people.refetch()}
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
