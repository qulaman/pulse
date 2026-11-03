"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DataGrid, type Column, type Group } from "@/components/desk/ui/DataGrid";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { PersonCell } from "@/components/desk/ui/PersonCell";
import { SearchField, Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import { LOAD_COLOR, LOAD_LABEL, loadColor, useTeamLoads, type Load } from "@/lib/people/loads";
import { AVAILABILITY_LABEL, ROLE_LABEL, usePeople, type Person, type Role } from "@/lib/people/queries";
import { useTeamBalances } from "@/lib/points/queries";
import { usePushHealth } from "@/lib/push/health-query";
import type { Health } from "@/lib/push/health";
import { pluralRu } from "@/lib/tasks/status-text";

import { AVAILABILITY_TONE, Dot, GridBone, ROLE_ORDER, matchesPerson } from "./shared";

const DAY = 24 * 3_600_000;
const NO_LOADS: Record<string, Load> = {};
const NO_BALANCES: Record<string, number> = {};

/** Whose load counts: a person at work, not the wall or a person who left. */
const works = (p: Person) => p.is_active && p.role !== "tv";

/**
 * «Вход» from what the roster already knows without a request per person (tasks/022 B.1). The
 * profile row carries no sign-in, so the closest truth is the push channel (D-114): a device
 * that takes pushes was signed in on; no channel says nothing about a sign-in — «—», and the
 * card tells the rest («Последний вход», the last code).
 */
function LoginCell({ person, health }: { person: Person; health: Health | undefined }) {
  if (!person.is_active) return <span className="text-muted">закрыт</span>;
  if (!health) return <span className="text-muted">…</span>;
  if (health.state === "ok" || health.state === "idle") return <Dot tone="ok" title={`Уведомления: ${health.text}`}>на телефоне</Dot>;
  if (health.state === "broken") return <Dot tone="warn" title={`Уведомления: ${health.text}`}>пуш не прошёл</Dot>;
  return (
    <span className="text-muted" title={`Уведомления: ${health.text}. Вход — в карточке`}>
      —
    </span>
  );
}

function plural(n: number, forms: [string, string, string]) {
  return `${n} ${pluralRu(n, forms)}`;
}

/** A count that says something only above zero. */
function Count({ value, tone }: { value: number; tone?: Tone }) {
  if (value === 0) return <span className="nums text-muted/60">0</span>;
  return (
    <span className="nums font-semibold" style={{ color: tone ? TONE_VAR[tone] : undefined }}>
      {value}
    </span>
  );
}

type Props = {
  director: boolean;
  people: Person[] | undefined;
  loading: boolean;
  loads: Record<string, Load>;
  balances: Record<string, number>;
  pointsOn: boolean;
  push: Map<string, Health> | undefined;
};

/**
 * «Команда» on the desk (D-153, tasks/022 B.1): the whole roster as one table — who is where,
 * how loaded (the director's: the secretary sees nobody's tasks, D-104), the points, whether the
 * person is reachable. Search, a role filter, a sort per column; a row opens the person's card.
 * Those who left wait at the bottom, grey.
 */
function TeamTableView({ director, people, loading, loads, balances, pointsOn, push }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [selected, setSelected] = useState<string | null>(null);
  // «дедлайн близко» does not need a live tick here: the clock is read once per mount
  const [now] = useState(() => Date.now());

  const all = useMemo(() => people ?? [], [people]);
  const roles = useMemo(() => {
    const present = new Set(all.filter((p) => p.is_active).map((p) => p.role));
    return (Object.keys(ROLE_ORDER) as Role[]).filter((r) => present.has(r)).sort((a, b) => ROLE_ORDER[a] - ROLE_ORDER[b]);
  }, [all]);

  const shown = all.filter((p) => (role ? p.role === role : true) && matchesPerson(p, query));
  const byRole = (a: Person, b: Person) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.full_name.localeCompare(b.full_name, "ru");
  const groups: Group<Person>[] = [
    { key: "active", title: null, rows: shown.filter((p) => p.is_active).sort(byRole) },
    { key: "gone", title: "Уволенные", tone: "muted", rows: shown.filter((p) => !p.is_active).sort(byRole) },
  ];

  const load = (p: Person) => (works(p) ? loads[p.id] : undefined);
  const inWork = (p: Person) => (load(p) ? load(p)!.active - load(p)!.review : 0);
  const byName = (a: Person, b: Person) => a.full_name.localeCompare(b.full_name, "ru");

  const columns: Column<Person>[] = [
    {
      key: "name",
      title: "Имя",
      // the name keeps its room; the others shrink to their titles' longest word on a narrower window
      width: "minmax(160px,1fr)",
      sort: byName,
      render: (p) => <PersonCell name={p.full_name} sub={p.position} muted={!p.is_active} />,
    },
    {
      key: "role",
      title: "Роль",
      width: "minmax(112px,140px)",
      sort: (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || byName(a, b),
      render: (p) => <span className={p.is_active ? "" : "text-muted"}>{ROLE_LABEL[p.role]}</span>,
    },
    {
      key: "availability",
      title: "Доступность",
      width: "minmax(132px,140px)",
      sort: (a, b) => Number(a.availability !== "active") - Number(b.availability !== "active") || byName(a, b),
      render: (p) =>
        !p.is_active ? (
          <span className="text-muted">не работает</span>
        ) : p.role === "tv" ? (
          <span className="text-muted">—</span>
        ) : (
          <Dot tone={AVAILABILITY_TONE[p.availability]}>{AVAILABILITY_LABEL[p.availability]}</Dot>
        ),
    },
  ];

  if (director) {
    columns.push(
      {
        key: "work",
        title: "В работе",
        width: "minmax(88px,104px)",
        align: "right",
        sort: (a, b) => inWork(a) - inWork(b),
        render: (p) => {
          if (!works(p)) return <span className="text-muted/60">—</span>;
          const color = loadColor(load(p), p.availability === "active", now);
          return (
            <span className="nums font-semibold" style={{ color: inWork(p) ? LOAD_COLOR[color] : "var(--text-muted)" }} title={LOAD_LABEL[color]}>
              {inWork(p)}
            </span>
          );
        },
      },
      {
        key: "overdue",
        title: "Просрочено",
        width: "minmax(122px,128px)",
        align: "right",
        sort: (a, b) => (load(a)?.overdue ?? 0) - (load(b)?.overdue ?? 0),
        render: (p) => (works(p) ? <Count value={load(p)?.overdue ?? 0} tone="danger" /> : <span className="text-muted/60">—</span>),
      },
      {
        key: "review",
        title: "На приёмке",
        width: "minmax(96px,124px)",
        align: "right",
        sort: (a, b) => (load(a)?.review ?? 0) - (load(b)?.review ?? 0),
        render: (p) => (works(p) ? <Count value={load(p)?.review ?? 0} tone="warn" /> : <span className="text-muted/60">—</span>),
      },
      {
        key: "nearest",
        title: "Ближайший срок",
        width: "minmax(114px,150px)",
        // the undated last, whichever way
        sort: (a, b) => (load(a)?.nearest ?? "9999").localeCompare(load(b)?.nearest ?? "9999"),
        render: (p) => {
          const nearest = load(p)?.nearest;
          if (!nearest) return <span className="text-muted/60">—</span>;
          const at = new Date(nearest).getTime();
          const tone: Tone = at < now ? "danger" : at - now < DAY ? "warn" : "muted";
          return (
            <span className="nums" style={{ color: tone === "muted" ? undefined : TONE_VAR[tone] }}>
              {humanAqtobe(new Date(nearest), new Date(now))}
            </span>
          );
        },
      },
    );
    if (pointsOn) {
      columns.push({
        key: "points",
        title: "Очки",
        width: "minmax(72px,88px)",
        align: "right",
        sort: (a, b) => (balances[a.id] ?? 0) - (balances[b.id] ?? 0),
        // the director and the wall play no game (the phone's roster rule)
        render: (p) =>
          works(p) && p.role !== "director" ? (
            <span className="nums font-semibold" style={{ color: "var(--gold)" }}>
              {balances[p.id] ?? 0}
            </span>
          ) : (
            <span className="text-muted/60">—</span>
          ),
      });
    }
  }

  columns.push({
    key: "login",
    title: "Вход",
    width: "minmax(104px,136px)",
    render: (p) => (p.role === "tv" && p.is_active ? <span className="text-muted">киоск</span> : <LoginCell person={p} health={push?.get(p.id)} />),
  });

  // the head's line: the team's state in words, red when someone is late (the phone's «Команда»)
  const staff = all.filter(works);
  const away = staff.filter((p) => p.availability !== "active").length;
  const open = staff.reduce((sum, p) => sum + (loads[p.id]?.active ?? 0), 0);
  const overdue = staff.reduce((sum, p) => sum + (loads[p.id]?.overdue ?? 0), 0);
  const state = loading
    ? null
    : director
      ? {
          text: [
            `${staff.length - away} на месте`,
            away > 0 ? `${away} ${pluralRu(away, ["отсутствует", "отсутствуют", "отсутствуют"])}` : null,
            `${plural(open, ["задача", "задачи", "задач"])} в работе`,
            overdue > 0 ? `${overdue} просроч.` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          tone: overdue > 0 ? ("danger" as const) : undefined,
        }
      : { text: `${plural(staff.length, ["человек", "человека", "человек"])} в компании${away > 0 ? ` · ${away} ${pluralRu(away, ["отсутствует", "отсутствуют", "отсутствуют"])}` : ""}` };

  const openCard = (id: string) => router.push(`/desk/team/${id}`);
  const count = shown.filter((p) => p.is_active).length;

  return (
    <DeskPage>
      <PageTitle
        title="Команда"
        state={state}
        actions={
          <Link href="/desk/team/new" data-testid="desk-team-new">
            <Button size="sm">Новый сотрудник</Button>
          </Link>
        }
      />
      <Toolbar end={<span className="nums text-[13px] leading-4 text-muted">{loading ? " " : plural(count, ["человек", "человека", "человек"])}</span>}>
        <SearchField value={query} onChange={setQuery} placeholder="Имя, должность или как зовут в речи" width={320} aria-label="Поиск по команде" />
        <Select value={role} onChange={(event) => setRole(event.target.value as Role | "")} aria-label="Роль" data-testid="desk-team-role">
          <option value="">Все роли</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
      </Toolbar>
      {loading ? (
        <GridBone columns={director ? 7 : 4} />
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
            // a click anywhere on a row opens the card; the keys only move the choice, Enter opens it
            onRowClick={(p) => openCard(p.id)}
            empty={
              <EmptyState
                title={query || role ? "Никого не нашлось" : "В команде пока никого"}
                hint={query || role ? "Поиск — по имени, должности и тому, как человека зовут в речи" : "Добавьте первого — он войдёт по коду из 8 цифр"}
              />
            }
          />
        </div>
      )}
    </DeskPage>
  );
}

/** The director's table: loads and points come with it. */
function DirectorTeam() {
  const { pointsEnabled } = useDeskScope();
  const people = usePeople();
  const loads = useTeamLoads();
  const balances = useTeamBalances(pointsEnabled);
  const push = usePushHealth();
  return (
    <TeamTableView
      director
      people={people.data}
      loading={people.isLoading || loads.isLoading}
      loads={loads.data ?? NO_LOADS}
      balances={balances.data ?? NO_BALANCES}
      pointsOn={pointsEnabled}
      push={push.data}
    />
  );
}

/** The secretary's: the roster only — nobody's tasks or points are hers to read (D-104). */
function SecretaryTeam() {
  const people = usePeople();
  const push = usePushHealth();
  return (
    <TeamTableView director={false} people={people.data} loading={people.isLoading} loads={NO_LOADS} balances={NO_BALANCES} pointsOn={false} push={push.data} />
  );
}

export function TeamTable() {
  const { role } = useDeskScope();
  return role === "director" ? <DirectorTeam /> : <SecretaryTeam />;
}
