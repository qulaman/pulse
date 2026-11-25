"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Chip } from "@/components/ui/Chip";
import { formatNum } from "@/lib/desk/format";
import { AVAILABILITY_LABEL, ROLE_LABEL, type Person } from "@/lib/people/queries";
import { absenceOf, isGoneMember, isTeamMember } from "@/lib/people/team";
import { textHas } from "@/lib/people/search";
import { LOAD_COLOR, LOAD_LABEL, loadColor, type Load } from "@/lib/people/loads";
import { useTeamBalances } from "@/lib/points/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import { initialsOf } from "@/lib/people/names";

type Filter = "all" | "present" | "away" | "busy" | "free";
type Sort = "name" | "load" | "points";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "present", label: "На месте" },
  { key: "away", label: "Отсутствуют" },
  { key: "busy", label: "Перегружены" },
  { key: "free", label: "Свободны" },
];

const ROLE_ORDER: Record<string, number> = { manager: 1, employee: 2, shopkeeper: 2, secretary: 2, director: 8, tv: 9 };

type Group = "lead" | "staff" | "director";

/** The team in two groups; the directors after it, apart and out of the team's count (lib/people/team.ts). */
function groupOf(p: Person): Group {
  if (p.role === "director") return "director";
  return p.role === "manager" ? "lead" : "staff";
}

function groupLabel(group: Group, count: number): string {
  if (group === "director") return count === 1 ? "Директор" : "Директора";
  return group === "lead" ? "Руководители" : "Сотрудники";
}

function matches(p: Person, q: string): boolean {
  return textHas([p.full_name, p.position, ...p.aliases, ROLE_LABEL[p.role]], q);
}

/** One person: avatar with the load dot, name and position, load and points on the right. */
function Row({ person, load, balance, pointsOn }: { person: Person; load: Load | undefined; balance: number | undefined; pointsOn: boolean }) {
  const available = person.is_active && absenceOf(person) === null;
  const color = loadColor(load, available);
  const active = load?.active ?? 0;
  return (
    <li>
      <Link
        href={`/people/${person.id}`}
        className="flex items-center gap-3 card px-3 py-3 transition-transform duration-[120ms] active:scale-[0.99]"
        style={{ opacity: person.is_active ? 1 : 0.55 }}
      >
        <span
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold text-bg"
          style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)" }}
        >
          {initialsOf(person.full_name)}
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface"
            style={{ background: person.is_active ? LOAD_COLOR[color] : "var(--border)" }}
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] leading-[22px]">{person.full_name}</span>
          <span className="block truncate text-[13px] leading-4 text-muted">
            {person.position ?? ROLE_LABEL[person.role]}
            {person.aliases.length ? ` · ${person.aliases.join(", ")}` : ""}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          {!person.is_active ? (
            <Chip tone="muted" interactive={false}>не в команде</Chip>
          ) : person.availability !== "active" ? (
            <Chip tone="warn" interactive={false}>{AVAILABILITY_LABEL[person.availability]}</Chip>
          ) : absenceOf(person) === "out" ? (
            <Chip tone="warn" interactive={false}>не на месте</Chip>
          ) : person.role === "director" ? null : active === 0 ? (
            <span className="text-[13px] leading-4 text-muted">дел нет</span>
          ) : (
            <span className="nums text-[13px] leading-4" style={{ color: LOAD_COLOR[color] }}>
              {active} {pluralRu(active, ["задача", "задачи", "задач"])}
              {load && load.overdue > 0
                ? ` · ${load.overdue} просроч.`
                : load && load.review > 0
                  ? ` · ${load.review} на проверке`
                  : load && (load.waiting ?? 0) > 0
                    ? ` · ${load.waiting} не ${pluralRu(load.waiting ?? 0, ["принята", "приняты", "приняты"])}`
                    : ""}
            </span>
          )}
          {pointsOn && isTeamMember(person) ? (
            <span className="nums whitespace-nowrap text-[13px] font-semibold leading-4" style={{ color: (balance ?? 0) > 0 ? "var(--gold)" : "var(--text-muted)" }}>
              {formatNum(balance ?? 0)} очк.
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

/**
 * The roster with the director's working questions answered on the spot: who is free,
 * who is drowning, who is away — search by name, position or the spoken alias,
 * filters, three sorts, groups by role, the departed folded away at the bottom.
 * Counted is the team (lib/people/team.ts): the directors stand apart after it, the wall's kiosk
 * is not a person and lives on «Экран» (D-135), the ones who left only in their fold.
 */
export function TeamList({ people, loads, pointsOn }: { people: Person[]; loads: Record<string, Load> | undefined; pointsOn: boolean }) {
  const balances = useTeamBalances(pointsOn);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [showInactive, setShowInactive] = useState(false);

  const q = query.trim();
  const loadMap = useMemo(() => loads ?? {}, [loads]);
  const balanceMap = useMemo(() => balances.data ?? {}, [balances.data]);
  // the clock is read once per mount — «дедлайн близко» does not need a live tick here
  const [now] = useState(() => Date.now());

  const team = useMemo(() => people.filter(isTeamMember), [people]);
  const visible = useMemo(() => {
    return people
      .filter((p) => p.is_active && p.role !== "tv")
      // a director has no load and no absence to filter by: he is in the list only as it is
      .filter((p) => filter === "all" || isTeamMember(p))
      .filter((p) => matches(p, q))
      .filter((p) => {
        const load = loadMap[p.id];
        const away = absenceOf(p, now) !== null;
        switch (filter) {
          case "present":
            return !away;
          case "away":
            return away;
          case "busy":
            return !away && (loadColor(load, true, now) === "red" || (load?.active ?? 0) >= 4);
          case "free":
            return !away && (load?.active ?? 0) === 0;
          default:
            return true;
        }
      })
      .sort((a, b) => {
        if (sort === "load") return (loadMap[b.id]?.active ?? 0) - (loadMap[a.id]?.active ?? 0) || a.full_name.localeCompare(b.full_name, "ru");
        if (sort === "points") return (balanceMap[b.id] ?? 0) - (balanceMap[a.id] ?? 0) || a.full_name.localeCompare(b.full_name, "ru");
        return (ROLE_ORDER[a.role] ?? 5) - (ROLE_ORDER[b.role] ?? 5) || a.full_name.localeCompare(b.full_name, "ru");
      });
  }, [people, q, filter, sort, loadMap, balanceMap, now]);

  const inactive = people.filter((p) => isGoneMember(p) && matches(p, q));
  const shownTeam = visible.filter(isTeamMember).length;

  const groups: { key: Group | "all"; items: Person[] }[] =
    sort === "name"
      ? (["lead", "staff", "director"] as const).map((key) => ({ key, items: visible.filter((p) => groupOf(p) === key) })).filter((g) => g.items.length > 0)
      : [{ key: "all", items: visible }];

  return (
    <div className="mt-4">
      <label className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Имя, должность, прозвище"
          aria-label="Поиск по команде"
          className="min-h-[44px] w-full field pl-10 pr-10 text-[16px] leading-[22px] outline-none transition-colors duration-[120ms] placeholder:text-muted focus:border-accent"
        />
        {query ? (
          <button
            type="button"
            aria-label="Очистить"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-[18px] leading-none text-muted"
          >
            ×
          </button>
        ) : null}
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip key={f.key} tone={filter === f.key ? "accent" : "neutral"} onClick={() => setFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[13px] leading-4 text-muted">
        {/* the team's count, the same «N в команде» as the profile and the reports; a filter says «из N» */}
        <span className="nums">{filter === "all" && !q ? `${team.length} в команде` : `${shownTeam} из ${team.length}`}</span>
        <span className="flex items-center gap-1">
          <span>Сортировка:</span>
          {(
            [
              ["name", "имя"],
              ["load", "загрузка"],
              ...(pointsOn ? ([["points", "очки"]] as const) : []),
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              className="min-h-[32px] rounded-[8px] px-2"
              style={{ color: sort === key ? "var(--accent)" : "var(--text-muted)", fontWeight: sort === key ? 600 : 400 }}
            >
              {label}
            </button>
          ))}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 card px-4 py-6 text-center text-[16px] leading-[22px] text-muted">
          {q ? "Никого с таким именем или должностью" : "Никого в этой группе"}
        </p>
      ) : null}

      {groups.map((group) => (
        <section key={group.key} className="mt-4">
          {group.key !== "all" ? (
            <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
              {groupLabel(group.key, group.items.length)}
              <span className="nums rounded-full bg-surface-2 px-2 text-[12px] font-medium normal-case tracking-normal">{group.items.length}</span>
            </h2>
          ) : null}
          <ul className="space-y-2">
            {group.items.map((person) => (
              <Row key={person.id} person={person} load={loadMap[person.id]} balance={balanceMap[person.id]} pointsOn={pointsOn} />
            ))}
          </ul>
        </section>
      ))}

      {inactive.length > 0 ? (
        <section className="mt-5">
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            aria-expanded={showInactive}
            className="text-[13px] leading-4 text-muted"
          >
            {showInactive ? "Скрыть ушедших" : `Ушедшие · ${inactive.length}`}
          </button>
          {showInactive ? (
            <ul className="mt-2 space-y-2">
              {inactive.map((person) => (
                <Row key={person.id} person={person} load={undefined} balance={undefined} pointsOn={false} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <p className="mt-4 text-[11px] leading-4 text-muted">
        Точка у аватара: {(["green", "yellow", "red", "gray"] as const).map((c, i) => (
          <span key={c}>
            <span aria-hidden className="mx-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: LOAD_COLOR[c] }} />
            {LOAD_LABEL[c]}
            {i < 3 ? " ·" : ""}
          </span>
        ))}
      </p>
    </div>
  );
}
