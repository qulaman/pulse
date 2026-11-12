"use client";

import { Check } from "lucide-react";
import type { CSSProperties } from "react";

import { FaceStack, PersonFace } from "@/components/desk/errands/look";
import type { Reach } from "@/lib/desk/ether";
import type { Announcement } from "@/lib/ether/queries";
import { shortName } from "@/lib/people/names";
import type { Person } from "@/lib/people/queries";

/** How many faces a card shows of each side before «+N». */
const READ_FACES = 6;
const UNREAD_FACES = 4;

type Ack = Announcement["acks"][number];

/** A reader's name: the ack's own, the roster's, or a plain word. */
export function ackName(ack: Ack, team: readonly Person[]): string {
  return ack.user?.full_name ?? team.find((person) => person.id === ack.user_id)?.full_name ?? "Сотрудник";
}

/**
 * The reach of an announcement on its card (D-174): a bar that fills as the team reads it, «5 из
 * 7», the faces of who read — the first to read first — and, dimmer, of who has not yet. All read —
 * the bar turns green with a tick. The team unknown yet — the count alone, never «3 из 0».
 */
export function ReachLine({ item, reach, team, held }: { item: Announcement; reach: Reach<Person> | null; team: readonly Person[]; held: boolean }) {
  const acks = [...item.acks].sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (held) {
    return <span className="text-[12px] leading-4 text-muted">Ещё не отправлено — отметки появятся, когда команда получит</span>;
  }
  const all = reach !== null && reach.of > 0 && reach.seen >= reach.of;
  const fill = reach && reach.of > 0 ? reach.seen / reach.of : 0;
  return (
    <span className="ether-reach" data-all={all ? "" : undefined}>
      {reach ? (
        <span className="ether-meter" aria-hidden style={{ "--fill": fill } as CSSProperties}>
          <i />
        </span>
      ) : null}
      <span className="nums ether-reach-count" data-testid="ether-reach">
        {all ? <Check size={13} strokeWidth={2.75} aria-hidden /> : null}
        {reach ? (
          <>
            {reach.seen}
            <span className="text-muted"> из {reach.of}</span>
          </>
        ) : (
          acks.length
        )}
      </span>
      <span className="ether-reach-word">{all ? "все ознакомились" : "ознакомились"}</span>
      {acks.length > 0 ? (
        <FaceStack more={Math.max(0, acks.length - READ_FACES)} label={`Ознакомились: ${acks.map((ack) => shortName(ackName(ack, team))).join(", ")}`}>
          {acks.slice(0, READ_FACES).map((ack) => (
            <PersonFace key={ack.user_id} id={ack.user_id} name={ackName(ack, team)} size={22} />
          ))}
        </FaceStack>
      ) : null}
      {reach && reach.missing.length > 0 && !all ? (
        <span className="ether-unread" title={`Ещё нет: ${reach.missing.map((person) => shortName(person.full_name)).join(", ")}`}>
          <span className="ether-unread-word">ещё нет</span>
          <FaceStack more={Math.max(0, reach.missing.length - UNREAD_FACES)}>
            {reach.missing.slice(0, UNREAD_FACES).map((person) => (
              <PersonFace key={person.id} id={person.id} name={person.full_name} size={22} away />
            ))}
          </FaceStack>
        </span>
      ) : null}
    </span>
  );
}

/** The reach as a ring that draws itself to its share, the count inside: the panel's figure. */
export function ReachRing({ seen, of, size = 64 }: { seen: number; of: number; size?: number }) {
  const r = (size - 8) / 2;
  const length = 2 * Math.PI * r;
  const share = of > 0 ? Math.min(1, seen / of) : 0;
  return (
    <span className="ether-ring" data-all={of > 0 && seen >= of ? "" : undefined} style={{ width: size, height: size }} role="img" aria-label={`Ознакомились ${seen} из ${of}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="ether-ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ether-ring-fill"
          style={{ strokeDasharray: length, strokeDashoffset: length * (1 - share), "--len": length } as CSSProperties}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ether-ring-count nums">
        {seen}
        <span>/{of}</span>
      </span>
    </span>
  );
}
