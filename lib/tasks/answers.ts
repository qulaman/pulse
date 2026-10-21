import { humanAqtobe } from "@/lib/ai/time";

/**
 * The director's one-tap answers to an employee's question (D-142), by what the question asks.
 * «Да / Нет» used to answer everything — the employee's own ready-made questions included
 * («Какой формат?», «Где взять данные?», «Когда срок?»), and «Да» to «Какой формат?» is noise.
 *
 *   yesno   «Сделать сегодня?» — Да / Нет / Позже / Действуй сам
 *   urgent  «Это срочно?»      — Срочно / Не срочно / Действуй сам
 *   when    «Когда срок?»      — the deadline as it is, today 18:00, tomorrow 12:00: a new date is
 *                                set on the task too, not only said in words
 *   open    «Какой формат?»    — no chip can answer it: words first (the caller shows
 *                                «Ответить словами»), then «Действуй сам» / «Позже отвечу»
 *
 * Pure: the cards only render it.
 */

export type QuestionKind = "yesno" | "urgent" | "when" | "open";

export type QuickAnswer = {
  label: string;
  /** what goes into the thread */
  text: string;
  /** the task's new deadline, when the answer sets one */
  deadlineIso?: string;
};

// JS word boundaries know only Latin letters: the edges of Cyrillic words are spelled out
const END = "(?=[\\s?,.!]|$)";
const OPEN_START = new RegExp(
  "^(как|какой|какая|какое|какие|каким|какую|каков|где|куда|откуда|сколько|кто|кому|кого|что|чем|чего|почему|зачем|чей|чья|чье|чьи)" + END,
  "u",
);
const WHEN = new RegExp("^(когда|к какому|до какого|на когда)" + END + "|(^|[\\s,])срок" + END, "u");
const URGENT = new RegExp("(^|[\\s,])(срочно|горит)" + END, "u");

export function questionKind(question: string): QuestionKind {
  const q = question.trim().toLowerCase().replace(/ё/g, "е");
  if (URGENT.test(q)) return "urgent";
  if (WHEN.test(q)) return "when";
  if (OPEN_START.test(q)) return "open";
  return "yesno";
}

/** Aqtobe (UTC+5, no DST) wall time `dayShift` days from today, as an ISO string. */
function aqtobeAt(dayShift: number, hours: number, now: Date): string {
  const wall = new Date(now.getTime() + 5 * 3_600_000);
  return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + dayShift, hours - 5, 0, 0)).toISOString();
}

export function answersFor(question: string, deadline: string | null, now: Date = new Date()): QuickAnswer[] {
  switch (questionKind(question)) {
    case "urgent":
      return [
        { label: "Срочно", text: "Срочно" },
        { label: "Не срочно", text: "Не срочно" },
        { label: "Действуй сам", text: "Действуй сам" },
      ];
    case "when": {
      const answers: QuickAnswer[] = [];
      if (deadline && new Date(deadline).getTime() > now.getTime()) {
        const when = humanAqtobe(new Date(deadline), now);
        answers.push({ label: `Как в задаче · ${when}`, text: `Срок как в задаче: ${when}` });
      }
      const today = aqtobeAt(0, 18, now);
      // «сегодня 18:00» only while there is still a working afternoon ahead
      if (new Date(today).getTime() - now.getTime() > 60 * 60_000) answers.push({ label: "Сегодня 18:00", text: "Сегодня до 18:00", deadlineIso: today });
      answers.push({ label: "Завтра 12:00", text: "Завтра до 12:00", deadlineIso: aqtobeAt(1, 12, now) });
      return answers;
    }
    case "open":
      return [
        { label: "Действуй сам", text: "Действуй сам" },
        { label: "Позже отвечу", text: "Позже отвечу" },
      ];
    default:
      return [
        { label: "Да", text: "Да" },
        { label: "Нет", text: "Нет" },
        { label: "Позже", text: "Позже" },
        { label: "Действуй сам", text: "Действуй сам" },
      ];
  }
}

/** An open question asks for words: the caller puts «Ответить словами» first and loud. */
export function wantsWords(question: string): boolean {
  return questionKind(question) === "open";
}
