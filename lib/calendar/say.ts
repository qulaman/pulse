import { humanAqtobe } from "@/lib/ai/time";
import { quoteTitleOf, type Phrase } from "@/lib/pulse/board";
import { firstNameOf } from "@/lib/text/normalize";

import { hhmm, nextEvent, peopleCount, ymdOfEvent } from "./agenda";
import type { CalendarEvent } from "./queries";

/**
 * What the assistant says about the calendar — the third source of news after the board
 * and Эфир, built exactly like them: the diff of two feeds, one phrase per change, facts
 * without exclamation marks (docs/DESIGN.md §4). Verbs never agree with the person: a
 * name gives no gender, hence «Марат будет», never «Марат придёт сам».
 */

const MINUTE_MS = 60 * 1000;

function peopleWord(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "человек";
  if (mod10 === 1) return "человек";
  if (mod10 >= 2 && mod10 <= 4) return "человека";
  return "человек";
}

export function describeCalendar(
  prev: readonly CalendarEvent[],
  next: readonly CalendarEvent[],
  now: Date,
  meId: string,
): Phrase[] {
  const before = new Map(prev.map((event) => [event.id, event]));
  const phrases: Phrase[] = [];

  for (const event of next) {
    const was = before.get(event.id);
    const quote = quoteTitleOf(event.title);

    if (!was) {
      // a meeting somebody else called me to: the invitation is the news, not the row
      const invited = event.participants.some((p) => p.user_id === meId);
      if (invited && event.author_id !== meId) {
        phrases.push({
          text: `Приглашение: ${quote}, ${humanAqtobe(new Date(event.starts_at), now)}`,
          tone: "warn",
          source: "calendar",
        });
      }
      continue;
    }

    // the tick woke up and reminded everybody: the mascot says it out loud
    if (!was.reminded_at && event.reminded_at) {
      const left = Math.round((new Date(event.starts_at).getTime() - now.getTime()) / MINUTE_MS);
      phrases.push(
        left <= 0
          ? { text: `Началось: ${quote}`, tone: "warn", source: "calendar" }
          : {
              text: `Через ${left} ${left === 1 ? "минуту" : left < 5 ? "минуты" : "минут"} — ${quote}, ${peopleCount(event)} ${peopleWord(peopleCount(event))}`,
              tone: "warn",
              source: "calendar",
            },
      );
    }

    if (was.starts_at !== event.starts_at) {
      phrases.push({
        text: `Перенос: ${quote} теперь ${humanAqtobe(new Date(event.starts_at), now)}`,
        tone: "muted",
        source: "calendar",
      });
    }

    // who answered since the last feed — my own answer is not news to me
    const seen = new Map(was.participants.map((p) => [p.user_id, p.status]));
    for (const person of event.participants) {
      if (person.user_id === meId || seen.get(person.user_id) === person.status) continue;
      const name = firstNameOf(person.person?.full_name ?? "") || "Сотрудник";
      if (person.status === "going") {
        phrases.push({ text: `${name} будет на ${quote}`, tone: "ok", source: "calendar" });
      } else if (person.status === "declined") {
        phrases.push({
          text: `${name} не сможет на ${quote}${person.reason ? `: ${person.reason.toLowerCase()}` : ""}`,
          tone: "muted",
          source: "calendar",
        });
      }
    }
  }

  return phrases;
}

/** «Сегодня в 15:00 — «Планёрка», 6 человек» — the opening line's calendar row. */
export function nextEventLine(events: readonly CalendarEvent[] | undefined, now: Date): string | null {
  const event = nextEvent(events ?? [], now);
  if (!event) return null;
  // today only: what is tomorrow is not news for the line under the greeting
  const today = ymdOfEvent({ starts_at: now.toISOString() });
  if (ymdOfEvent(event) !== today) return null;
  const count = peopleCount(event);
  return `Сегодня в ${hhmm(event.starts_at)} — ${quoteTitleOf(event.title)}, ${count} ${peopleWord(count)}`;
}
