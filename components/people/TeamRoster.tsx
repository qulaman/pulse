"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Chip } from "@/components/ui/Chip";
import { canEditPerson, type Who } from "@/lib/people/access";
import type { Health } from "@/lib/push/health";
import { AVAILABILITY_LABEL, ROLE_LABEL, initialsOf, type Person, type Role } from "@/lib/people/queries";
import { pluralRu } from "@/lib/tasks/status-text";

/** Filter chips in the order of the role picker; a chip shows only when someone holds the role. */
const ROLE_CHIPS: { role: Role; label: string }[] = [
  { role: "director", label: "Директор" },
  { role: "manager", label: "Руководители" },
  { role: "employee", label: "Сотрудники" },
  { role: "secretary", label: "Секретари" },
  { role: "shopkeeper", label: "Магазин" },
  { role: "tv", label: "Экраны" },
];

const ROLE_ORDER: Record<Role, number> = { director: 0, manager: 1, secretary: 2, shopkeeper: 3, employee: 4, tv: 9 };

function normalise(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").trim();
}

function matches(p: Person, q: string): boolean {
  if (!q) return true;
  const hay = normalise([p.full_name, p.position ?? "", ...p.aliases, ROLE_LABEL[p.role]].join(" "));
  return q.split(/\s+/).every((word) => hay.includes(word));
}

function Line({ person, editable, me, push }: { person: Person; editable: boolean; me: boolean; push?: Health }) {
  const body = (
    <>
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold text-bg"
        style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)" }}
      >
        {initialsOf(person.full_name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] leading-[22px]">
          {person.full_name}
          {me ? <span className="text-muted"> · вы</span> : null}
        </span>
        <span className="block truncate text-[13px] leading-4 text-muted">
          {person.position ?? ROLE_LABEL[person.role]}
          {person.aliases.length ? ` · ${person.aliases.join(", ")}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Chip tone="neutral" interactive={false}>
          {ROLE_LABEL[person.role]}
        </Chip>
        {!person.is_active ? (
          <span className="text-[12px] leading-4 text-muted">не работает</span>
        ) : person.role !== "tv" && person.availability !== "active" ? (
          <span className="text-[12px] leading-4 text-warn">{AVAILABILITY_LABEL[person.availability]}</span>
        ) : null}
        {/* a dead push channel (D-114): this person hears about work only by opening Pulse */}
        {person.is_active && push && (push.state === "off" || push.state === "broken") ? (
          <span className="text-[12px] leading-4 text-danger">без уведомлений</span>
        ) : null}
      </span>
    </>
  );
  const base = "flex items-center gap-3 card px-3 py-3";
  return (
    <li style={{ opacity: person.is_active ? 1 : 0.55 }}>
      {editable ? (
        <Link href={`/people/${person.id}/edit`} data-testid="roster-row" className={`${base} transition-transform duration-[120ms] active:scale-[0.99]`}>
          {body}
        </Link>
      ) : (
        <div className={base} title="Карточку директора меняет только директор">
          {body}
        </div>
      )}
    </li>
  );
}

/**
 * The roster as «Настройки» → «Сотрудники» manages it (D-104): who holds which role at a
 * glance, search by name, position or spoken alias, a chip per role; a tap opens the
 * person's editor directly — role, card, password. The load board stays on «Команда».
 */
export function TeamRoster({ people, me, push }: { people: Person[]; me: Who | null; push?: Map<string, Health> }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const q = normalise(query);

  const active = useMemo(() => people.filter((p) => p.is_active), [people]);
  const counts = useMemo(() => {
    const map = new Map<Role, number>();
    for (const p of active) map.set(p.role, (map.get(p.role) ?? 0) + 1);
    return map;
  }, [active]);

  const visible = active
    .filter((p) => (role ? p.role === role : true) && matches(p, q))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.full_name.localeCompare(b.full_name, "ru"));
  const inactive = people.filter((p) => !p.is_active && matches(p, q));
  const editable = (p: Person) => (me ? canEditPerson(me, p) : false);

  return (
    <div className="mt-3">
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
          aria-label="Поиск по сотрудникам"
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

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Chip tone={role === null ? "accent" : "neutral"} onClick={() => setRole(null)}>
          Все <span className="nums opacity-70">{active.length}</span>
        </Chip>
        {ROLE_CHIPS.filter((c) => counts.get(c.role)).map((c) => (
          <Chip key={c.role} tone={role === c.role ? "accent" : "neutral"} onClick={() => setRole(role === c.role ? null : c.role)}>
            {c.label} <span className="nums opacity-70">{counts.get(c.role)}</span>
          </Chip>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 card px-4 py-6 text-center text-[16px] leading-[22px] text-muted">
          {q ? "Никого с таким именем или должностью" : "Никого с этой ролью"}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {visible.map((p) => (
            <Line key={p.id} person={p} editable={editable(p)} me={p.id === me?.id} push={push?.get(p.id)} />
          ))}
        </ul>
      )}

      {inactive.length > 0 ? (
        <section className="mt-5">
          <button type="button" onClick={() => setShowInactive((v) => !v)} aria-expanded={showInactive} className="min-h-[32px] text-[13px] leading-4 text-muted">
            {showInactive ? "Скрыть уволенных" : `Уволенные · ${inactive.length}`}
          </button>
          {showInactive ? (
            <ul className="mt-2 space-y-2">
              {inactive.map((p) => (
                <Line key={p.id} person={p} editable={editable(p)} me={false} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <p className="mt-4 px-1 text-[12px] leading-4 text-muted">
        {active.length} {pluralRu(active.length, ["человек", "человека", "человек"])} в компании · тап — роль, карточка, пароль
      </p>
    </div>
  );
}
