"use client";

import { useMemo } from "react";

import { TileFace } from "@/components/desk/team/TeamGrid";
import { usePeople } from "@/lib/people/queries";
import { shortName, useNamesKey } from "@/lib/people/names";

/** Everybody's photo by id, read once per screen: the faces of a table share one map. */
export function useAvatars(): ReadonlyMap<string, string | null> {
  const people = usePeople();
  return useMemo(() => new Map((people.data ?? []).map((person) => [person.id, person.avatar_url])), [people.data]);
}

/**
 * A person at the work screens of «Графит» (D-174): the face of «Команда» — the photo, or the
 * initials on the person's own hue — and the short name beside it. `gone` — the person left while
 * the task is still open (D-160): the red word under the name, as `PersonCell` says it.
 */
export function FaceName({
  id,
  name,
  avatar = null,
  size = 22,
  muted = false,
  gone = false,
  full = false,
}: {
  id: string;
  name: string | null | undefined;
  avatar?: string | null;
  size?: number;
  muted?: boolean;
  gone?: boolean;
  /** the whole name, not «Ерлан Б.» */
  full?: boolean;
}) {
  useNamesKey();
  const text = name ?? "";
  return (
    <span className={`tasks-face-name flex min-w-0 items-center gap-2 ${muted ? "opacity-55" : ""}`} data-gone={gone ? "" : undefined}>
      <TileFace person={{ id, full_name: text || "—", avatar_url: avatar }} size={size} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate" title={text || undefined}>
          {text ? (full ? text : shortName(text)) : "Без исполнителя"}
        </span>
        {gone ? (
          <span className="truncate text-[12px] font-medium leading-4 text-danger" title="Человек ушёл из команды — передайте задачу другому" data-testid="person-gone">
            ушёл
          </span>
        ) : null}
      </span>
    </span>
  );
}
