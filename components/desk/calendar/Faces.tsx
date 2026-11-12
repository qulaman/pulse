"use client";

import { useMemo, type CSSProperties } from "react";

import { TileFace } from "@/components/desk/team/TeamGrid";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { usePeople } from "@/lib/people/queries";

export type Participant = CalendarEvent["participants"][number];

/** The ring of an answer: coming — green, not coming — red, not said yet — a quiet grey. */
const RING: Record<string, string> = {
  going: "var(--ok)",
  declined: "var(--danger)",
  invited: "color-mix(in srgb, var(--text-muted) 40%, transparent)",
};

/** The photos of the team, by person: a participant row carries only the name. */
function usePhotos(): (id: string) => string | null {
  const people = usePeople();
  const byId = useMemo(() => new Map((people.data ?? []).map((person) => [person.id, person.avatar_url])), [people.data]);
  return (id) => byId.get(id) ?? null;
}

type FaceProps = { person: Participant; size: number; ring?: boolean; author?: boolean };

/** One participant's circle, ringed by their answer when `ring` is asked for. */
export function Face(props: FaceProps) {
  const photo = usePhotos();
  return <FaceView {...props} photo={photo(props.person.user_id)} />;
}

function FaceView({ person, size, ring = false, author = false, photo }: FaceProps & { photo: string | null }) {
  const status = author ? "going" : person.status;
  return (
    <span className="cal-face" style={(ring ? { "--ring": RING[status] ?? "transparent" } : undefined) as CSSProperties | undefined}>
      <TileFace person={{ id: person.user_id, full_name: person.person?.full_name ?? "Сотрудник", avatar_url: photo }} size={size} />
    </span>
  );
}

/**
 * Who comes, as faces (D-174): the ones who have not refused, overlapping a little, «+N» after
 * `max`. The names are in the title — a face is a glance, the card says it in words.
 */
export function Faces({ event, size = 20, max = 4, className = "" }: { event: CalendarEvent; size?: number; max?: number; className?: string }) {
  // one read of the roster for the whole stack, not one a face
  const photo = usePhotos();
  const coming = event.participants.filter((person) => person.status !== "declined");
  if (coming.length === 0) return null;
  const names = coming.map((person) => person.person?.full_name ?? "Сотрудник").join(", ");
  const shown = coming.slice(0, coming.length > max ? max - 1 : max);
  const more = coming.length - shown.length;
  return (
    <span className={`cal-faces ${className}`} title={names} style={{ "--face": `${size}px` } as CSSProperties}>
      {shown.map((person) => (
        <FaceView key={person.user_id} person={person} size={size} photo={photo(person.user_id)} />
      ))}
      {more > 0 ? <span className="cal-faces-more nums">+{more}</span> : null}
    </span>
  );
}
