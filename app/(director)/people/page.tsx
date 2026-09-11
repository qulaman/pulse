"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { RowListBone, SkeletonGroup } from "@/components/ui/Skeleton";
import { Chip } from "@/components/ui/Chip";
import { PeopleGrid } from "@/components/pulse/PeopleGrid";
import { AVAILABILITY_LABEL, ROLE_LABEL, initialsOf, usePeople } from "@/lib/people/queries";

const DOT: Record<string, string> = { active: "var(--ok)", vacation: "var(--text-muted)", sick: "var(--warn)" };

/** «Команда»: who is loaded how right now, then the roster the parser and the STT prompt are built from. */
export default function PeoplePage() {
  const people = usePeople();
  // directors first, the kiosk last, people alphabetically in between
  const ROLE_ORDER: Record<string, number> = { director: 0, manager: 1, employee: 2, shopkeeper: 2, tv: 9 };
  const rows = [...(people.data ?? [])].sort((a, b) => (ROLE_ORDER[a.role] ?? 5) - (ROLE_ORDER[b.role] ?? 5));
  const active = rows.filter((p) => p.is_active);
  const inactive = rows.filter((p) => !p.is_active);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold leading-[30px]">Команда</h1>
          <p className="mt-1 text-[13px] leading-4 text-muted">
            {people.isLoading ? " " : `${active.length} в команде`}
          </p>
        </div>
        <Link href="/people/new">
          <Button>+ Добавить</Button>
        </Link>
      </div>

      <PeopleGrid title="Сейчас" />

      <Link
        href="/rating"
        className="mt-6 flex min-h-[48px] items-center justify-between rounded-[16px] border border-border bg-surface px-4 text-[16px] leading-[22px]"
      >
        Рейтинг
        <span className="text-[13px] leading-4 text-muted">очки и динамика ›</span>
      </Link>

      <h2 className="mt-7 text-[19px] font-semibold leading-6">Все сотрудники</h2>

      {people.isLoading ? (
        <SkeletonGroup className="mt-5">
          <RowListBone count={7} />
        </SkeletonGroup>
      ) : null}
      <ul className="mt-3 space-y-2">
        {rows.length === 0 && !people.isLoading ? (
          <li className="text-[16px] leading-[22px] text-muted">Пока никого</li>
        ) : null}
        {[...active, ...inactive].map((person) => (
          <li key={person.id}>
            <Link
              href={`/people/${person.id}`}
              className="flex items-center gap-3 rounded-[16px] border border-border bg-surface px-3 py-3"
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
                  style={{ background: person.is_active ? DOT[person.availability] : "var(--border)" }}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] leading-[22px]">{person.full_name}</span>
                <span className="block truncate text-[13px] leading-4 text-muted">
                  {person.position ?? ROLE_LABEL[person.role]}
                  {person.aliases.length ? ` · ${person.aliases.join(", ")}` : ""}
                </span>
              </span>
              {!person.is_active ? (
                <Chip tone="muted" interactive={false}>уволен</Chip>
              ) : person.availability !== "active" ? (
                <Chip tone="warn" interactive={false}>{AVAILABILITY_LABEL[person.availability]}</Chip>
              ) : person.role !== "employee" ? (
                <Chip tone="neutral" interactive={false}>{ROLE_LABEL[person.role]}</Chip>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
