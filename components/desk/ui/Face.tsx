"use client";

import { useState, type CSSProperties } from "react";

import { hashOf, initialsOf } from "@/lib/idle/people";
import { usePeople, type Person } from "@/lib/people/queries";

/** What a person is doing, for the ring of their circle (`.team-face[data-state]`, D-172). */
export type FaceState = "gone" | "away" | "late" | "review" | "work" | "free" | "quiet";

const NOBODY: ReadonlyMap<string, string | null> = new Map();
const maps = new WeakMap<readonly Person[], ReadonlyMap<string, string | null>>();

/**
 * Everybody's photo by id. One map per read of the roster, shared by every circle of the screen:
 * a row that carries only a name finds its photo here without a search of its own.
 */
export function useAvatars(): ReadonlyMap<string, string | null> {
  const list = usePeople().data;
  if (!list) return NOBODY;
  let map = maps.get(list);
  if (!map) {
    map = new Map(list.map((person) => [person.id, person.avatar_url]));
    maps.set(list, map);
  }
  return map;
}

/**
 * A person's circle on the desk (D-172): the photo, or the initials on a soft gradient of the
 * person's own hue. A photo that does not load gives way to the initials. Drawn by `.team-face`.
 */
export function Face({ person, size, state }: { person: Pick<Person, "id" | "full_name" | "avatar_url">; size: number; state?: FaceState }) {
  const [broken, setBroken] = useState<string | null>(null);
  const url = person.avatar_url && person.avatar_url !== broken ? person.avatar_url : null;
  const hue = hashOf(person.id, 7) % 360;
  return (
    <span className="team-face" data-state={state} style={{ width: size, height: size, "--h": hue } as CSSProperties}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a profile photo from the public bucket
        <img src={url} alt="" decoding="async" onError={() => setBroken(url)} className="team-face-photo" />
      ) : (
        <span className="team-face-initials" style={{ fontSize: Math.round(size * 0.36) }}>
          {initialsOf(person.full_name)}
        </span>
      )}
    </span>
  );
}
