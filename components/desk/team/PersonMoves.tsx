"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plane, Thermometer, UserCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { AwardDialog, type AwardFor } from "@/components/desk/points/AwardDialog";
import { MenuButton, type MenuItem } from "@/components/desk/ui/Menu";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { dailyReportKeys } from "@/lib/daily-report/queries";
import { allMoves, personMoves, type Move, type MoveKey, type MovePlace } from "@/lib/desk/person-moves";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { useSetWorking } from "@/lib/people/card-queries";
import { isTeamMember, usePeople, useUpdatePerson, type Availability, type Person } from "@/lib/people/queries";
import { useComposeStore } from "@/lib/store/compose";
import { personFeedHref } from "@/lib/desk/reports-address";
import { useMe } from "@/lib/tasks/queries";

import { addressOf } from "./shared";

/** What a screen does its own way: the card under a tile edits in place, the page opens its dialogs. */
export type MoveHandlers = Partial<Record<MoveKey, () => void>>;

/** The icon beside a menu move — only where it says something a word does not. */
const ICON: Partial<Record<MoveKey, ReactNode>> = {
  vacation: <Plane size={16} />,
  sick: <Thermometer size={16} />,
  back: <UserCheck size={16} />,
};

/**
 * The moves of a person on the desk (D-194), one hook for every card: the set and its order come
 * from `personMoves` (lib/desk/person-moves.ts); the doing is the same everywhere unless the screen
 * hands its own (`MoveHandlers`): «Изменить» and «Карточка» lead to the person's page, «Удалить…» to
 * «Команда» with its dialog, «Начислить очки…» opens the points dialog here (`node`), the
 * availability is written at once and the reports re-read it.
 */
export function usePersonMoves(place: MovePlace) {
  const { pointsEnabled } = useDeskScope();
  const me = useMe();
  const router = useRouter();
  const people = usePeople();
  const settings = useCompanySettings();
  const update = useUpdatePerson();
  const setWorking = useSetWorking();
  const queryClient = useQueryClient();
  const [award, setAward] = useState<AwardFor | null>(null);
  const viewer = me.data ? { id: me.data.userId, role: me.data.role } : null;
  const reportsOn = settings.data?.daily_report.enabled;
  // the people the points are for: the team (lib/people/team.ts), as «Очки и магазин» gives them
  const team = useMemo(
    () =>
      (people.data ?? [])
        .filter(isTeamMember)
        .map((p) => ({ id: p.id, name: p.full_name, sub: p.position, avatar: p.avatar_url }))
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [people.data],
  );

  const setOf = (person: Person, held?: number) => (viewer ? personMoves(person, { place, viewer, pointsOn: pointsEnabled, reportsOn, held }) : { main: [], more: [] });

  const availability = (person: Person, next: Availability) =>
    update.mutate(
      { id: person.id, patch: { availability: next } },
      // the day's roll call and the табель read availability through the reports' own answers
      { onSuccess: () => void queryClient.invalidateQueries({ queryKey: dailyReportKeys.team }) },
    );

  const defaults = (person: Person): Record<MoveKey, () => void> => {
    const id = encodeURIComponent(person.id);
    return {
      give: () => useComposeStore.getState().request("", { id: person.id, name: person.full_name, address: addressOf(person) }),
      revive: () =>
        setWorking.mutate(
          { id: person.id, working: true },
          {
            onSuccess: () => toast(person.role === "tv" ? `Экран «${person.full_name}» включён` : `${person.full_name} снова в команде. Вход — по новому коду`),
            onError: (error) => toast(error.message),
          },
        ),
      edit: () => router.push(`/desk/team/${id}?edit=1`),
      card: () => router.push(`/desk/team/${id}`),
      tasks: () => router.push(`/desk/tasks?who=${id}`),
      reports: () => router.push(personFeedHref(id)),
      award: () => setAward({ userId: person.id }),
      vacation: () => availability(person, "vacation"),
      sick: () => availability(person, "sick"),
      back: () => availability(person, "active"),
      login: () => router.push(`/desk/team/${id}?login=1`),
      // the page holds the handing over; «Команда» the dialog that asks before anything goes
      pass: () => router.push(`/desk/team/${id}`),
      remove: () => router.push(`/desk/team?p=${id}&remove=1`),
    };
  };

  const itemOf = (person: Person, handlers: MoveHandlers | undefined, move: Move | "separator"): MenuItem => {
    if (move === "separator") return "separator";
    return {
      key: move.key,
      label: move.label,
      hint: move.hint,
      icon: ICON[move.key],
      danger: move.danger,
      onSelect: handlers?.[move.key] ?? defaults(person)[move.key],
    };
  };

  return {
    /** The set of moves for this person here. */
    setOf,
    /** Do a move: the screen's own way, else the shared one. */
    run: (person: Person, key: MoveKey, handlers?: MoveHandlers) => (handlers?.[key] ?? defaults(person)[key])(),
    /** «⋯» of the head. */
    more: (person: Person, handlers?: MoveHandlers, held?: number): MenuItem[] => setOf(person, held).more.map((move) => itemOf(person, handlers, move)),
    /** The right button's menu: every move, the head's first. */
    menu: (person: Person, handlers?: MoveHandlers, held?: number): MenuItem[] => allMoves(setOf(person, held)).map((move) => itemOf(person, handlers, move)),
    /** The dialog the moves open here; drawn once by the screen. */
    node: pointsEnabled ? <AwardDialog target={award} people={team} onClose={() => setAward(null)} /> : null,
  };
}

export type PersonMovesApi = ReturnType<typeof usePersonMoves>;

/**
 * The head's moves of a person — the same buttons in the same order on every desk card: «Дать
 * задачу» (the one fill), «Вернуть в команду», «Изменить», «Карточка →», «⋯», and × where the card
 * closes. `keys` — the letters the screen binds, shown in the tooltips; `hide` — a move the screen
 * holds open right now (no «Изменить» over the open editor).
 */
export function PersonMovesBar({
  person,
  moves,
  handlers,
  held,
  testId,
  keys = false,
  quietGive = false,
  hide = [],
  onClose,
  className = "",
}: {
  person: Person;
  moves: PersonMovesApi;
  handlers?: MoveHandlers;
  held?: number;
  /** The prefix of the buttons' test ids: `${testId}-give`, `-edit`, `-open`, `-revive`, `-more`, `-close`. */
  testId: string;
  keys?: boolean;
  /** «Дать задачу» without its fill while a form on the screen holds it. */
  quietGive?: boolean;
  hide?: MoveKey[];
  onClose?: () => void;
  className?: string;
}) {
  const set = moves.setOf(person, held);
  const main = set.main.filter((move) => !hide.includes(move.key));
  const more = moves.more(person, handlers, held).filter((item) => item === "separator" || !hide.includes(item.key as MoveKey));
  const run = (key: MoveKey) => moves.run(person, key, handlers);
  const tip = (move: Move, label: string, children: ReactNode) => (
    <Tooltip key={move.key} label={label} keys={keys && move.hint ? [move.hint] : undefined} side="bottom">
      {children}
    </Tooltip>
  );
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} data-testid={`${testId}-moves`}>
      {main.map((move) => {
        if (move.key === "give") {
          return tip(
            move,
            "Строка поручения уже знает, кому",
            <Button size="sm" variant={quietGive ? "secondary" : "primary"} onClick={() => run("give")} data-testid={`${testId}-give`}>
              {move.label}
            </Button>,
          );
        }
        if (move.key === "card") {
          const href = `/desk/team/${encodeURIComponent(person.id)}`;
          return tip(
            move,
            "Карточка целиком",
            // in full, ahead (D-184): a page that lands with its circle in one go lets the circle fly
            <Link
              href={href}
              prefetch
              // a way to the page, not a move on the person: quiet, as a link — the row stays one line in the panel
              className="inline-flex h-9 items-center gap-1 rounded-[8px] px-2 text-[13px] font-medium leading-4 text-muted transition-colors duration-[140ms] hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              data-testid={`${testId}-open`}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                run("card");
              }}
            >
              {move.label}
              <ArrowRight size={14} aria-hidden />
            </Link>,
          );
        }
        return tip(
          move,
          move.key === "edit" ? "Изменить карточку" : move.label,
          <Button size="sm" variant="secondary" onClick={() => run(move.key)} data-testid={`${testId}-${move.key}`}>
            {move.label}
          </Button>,
        );
      })}
      {more.length > 0 ? (
        <MenuButton
          items={more}
          label="Ещё"
          testId={`${testId}-more`}
          className="flex h-9 w-9 items-center justify-center rounded-[8px] text-[20px] leading-none text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          ⋯
        </MenuButton>
      ) : null}
      {onClose ? (
        <Tooltip label="Закрыть" keys={["Esc"]} side="bottom">
          <button
            type="button"
            aria-label="Закрыть карточку"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-[8px] text-muted hover:bg-surface-2 hover:text-text"
            data-testid={`${testId}-close`}
          >
            <X size={20} aria-hidden />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}
