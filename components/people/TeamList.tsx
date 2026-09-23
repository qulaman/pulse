"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Chip } from "@/components/ui/Chip";
import { AVAILABILITY_LABEL, ROLE_LABEL, initialsOf, type Person } from "@/lib/people/queries";
import { LOAD_COLOR, LOAD_LABEL, loadColor, type Load } from "@/lib/people/loads";
import { useTeamBalances } from "@/lib/points/queries";

type Filter = "all" | "present" | "away" | "busy" | "free";
type Sort = "name" | "load" | "points";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "present", label: "На месте" },
  { key: "away", label: "Отсутствуют" },
  { key: "busy", label: "Перегружены" },
  { key: "free", label: "Свободны" },
];

const ROLE_ORDER: Record<string, number> = { director: 0, manager: 1, employee: 2, shopkeeper: 2, tv: 9 };
const GROUP_LABEL: Record<string, string> = { lead: "Руководство", staff: "Сотрудники", tv: "Экраны" };

function groupOf(p: Person): "lead" | "staff" | "tv" {
  if (p.role === "tv") return "tv";
  if (p.role === "director" || p.role === "manager") return "lead";
  return "staff";
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").trim();
}

function matches(p: Person, q: string): boolean {
  if (!q) return true;
  const hay = normalise([p.full_name, p.position ?? "", ...p.aliases, ROLE_LABEL[p.role]].join(" "));
  return q.split(/\s+/).every((word) => hay.includes(word));
}

function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

/** One person: avatar with the load dot, name and position, load and points on the right. */
function Row({ person, load, balance, pointsOn }: { person: Person; load: Load | undefined; balance: number | undefined; pointsOn: boolean }) {
  const available = person.is_active && person.availability === "active";
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
            <Chip tone="muted" interactive={false}>не работает</Chip>
          ) : person.role === "tv" ? (
            <Chip tone="muted" interactive={false}>киоск</Chip>
          ) : person.availability !== "active" ? (
            <Chip tone="warn" interactive={false}>{AVAILABILITY_LABEL[person.availability]}</Chip>
          ) : active === 0 ? (
            <span className="text-[13px] leading-4 text-muted">свободен</span>
          ) : (
            <span className="nums text-[13px] leading-4" style={{ color: LOAD_COLOR[color] }}>
              {active} {plural(active, ["задача", "задачи", "задач"])}
              {load && load.overdue > 0 ? ` · ${load.overdue} просроч.` : load && load.review > 0 ? ` · ${load.review} на приёмке` : ""}
            </span>
          )}
          {pointsOn && person.is_active && person.role !== "tv" && person.role !== "director" ? (
            <span className="nums text-[13px] font-semibold leading-4" style={{ color: "var(--gold)" }}>
              {balance ?? 0} очк.
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
 */
export function TeamList({ people, loads, pointsOn }: { people: Person[]; loads: Record<string, Load> | undefined; pointsOn: boolean }) {
  const balances = useTeamBalances(pointsOn);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [showInactive, setShowInactive] = useState(false);

  const q = normalise(query);
  const loadMap = useMemo(() => loads ?? {}, [loads]);
  const balanceMap = useMemo(() => balances.data ?? {}, [balances.data]);
  // the clock is read once per mount — «дедлайн близко» does not need a live tick here
  const [now] = useState(() => Date.now());

  const visible = useMemo(() => {
    return people
      .filter((p) => p.is_active)
      .filter((p) => matches(p, q))
      .filter((p) => {
        const load = loadMap[p.id];
        const away = p.availability !== "active";
        switch (filter) {
          case "present":
            return !away && p.role !== "tv";
          case "away":
            return away;
          case "busy":
            return !away && (loadColor(load, true, now) === "red" || (load?.active ?? 0) >= 4);
          case "free":
            return !away && p.role !== "tv" && (load?.active ?? 0) === 0;
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

  const inactive = people.filter((p) => !p.is_active && matches(p, q));

  const groups: { key: string; items: Person[] }[] =
    sort === "name"
      ? ["lead", "staff", "tv"].map((key) => ({ key, items: visible.filter((p) => groupOf(p) === key) })).filter((g) => g.items.length > 0)
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
          placeholder="Имя, должность или как зовут в речи"
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
        <span className="nums">
          {visible.length} {plural(visible.length, ["человек", "человека", "человек"])}
        </span>
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
              {GROUP_LABEL[group.key]}
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
            {showInactive ? "Скрыть уволенных" : `Уволенные · ${inactive.length}`}
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
