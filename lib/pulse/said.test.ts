import { describe, expect, it } from "vitest";

import { entitiesSummary } from "@/components/confirm/format";
import type { PostprocessedEntity } from "@/lib/ai/postprocess";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { nextEventLine } from "@/lib/calendar/say";
import { isSendable, whyNothingToSend } from "@/lib/confirm/entities";

import { answer, type AnswerInput } from "./answers";
import { openingLine, type BoardTask, type Lanes, type SpeechTone } from "./board";
import { employeeOpening, employeeWaiting, reportPhrase } from "./employee";
import {
  GHOST_SHIFT_S,
  GREETING,
  hueOf,
  LAST_MAX_S,
  lineKeyOf,
  LONG_WORD,
  NEGATION,
  piecesOf,
  runsOf,
  sayAll,
  SERVICE,
  type Piece,
  type SaidLine,
  type Token,
  type Word,
} from "./said";

/* -------------------------------------------------------------------------- */
/* The corpus: what the band over the face really says, from the real builders  */
/* -------------------------------------------------------------------------- */

type Line = { text: string; tone?: SpeechTone };
type Scene = { who: "Пульс" | "Лента"; lines: Line[] };

// 2026-11-18 09:30 Aqtobe, a Wednesday
const NOW = new Date("2026-11-18T04:30:00Z");
const at = (dayShift: number, h: number, m = 0) => new Date(Date.UTC(2026, 10, 18 + dayShift, h - 5, m)).toISOString();

type TaskSeed = { title?: string; who?: string; deadline?: string | null; status?: string; ask?: boolean };
let seq = 0;
function task({ title = "Задача", who, deadline = null, status = "accepted", ask = false }: TaskSeed = {}): BoardTask {
  seq += 1;
  return {
    id: `t${seq}`,
    title,
    status,
    deadline,
    assignee_id: who ? `u-${who}` : null,
    assignee: who ? { full_name: who } : null,
    question: ask ? "?" : null,
    time_request: null,
  } as unknown as BoardTask;
}
const lanes = (l: Partial<Lanes>): Lanes => ({ overdue: [], declined: [], question: [], review: [], work: [], ...l });
const many = (n: number) => Array.from({ length: n }, () => task());
const work = (statuses: string[]) => statuses.map((status) => task({ status }));

function meeting(title: string, h: number, m: number, people: number): CalendarEvent {
  return {
    id: `e-${title}`,
    title,
    starts_at: at(0, h, m),
    ends_at: null,
    participants: Array.from({ length: people }, (_, i) => ({ user_id: `p${i}`, status: "going", person: { full_name: "Марат Оспанов" } })),
  } as unknown as CalendarEvent;
}
const MEETINGS = [meeting("Планёрка", 15, 0, 6), meeting("Ужин с партнёрами", 19, 30, 2), meeting("Разбор квартала", 11, 0, 1)];
const calendarLine = (event: CalendarEvent): Line => ({ text: nextEventLine([event], NOW)! });

const entity = (kind: string, blocked?: string) => ({ kind, blocked }) as unknown as PostprocessedEntity;

function buildCorpus(): Scene[] {
  const scenes: Scene[] = [];
  const add = (who: Scene["who"], lines: Line[]) => scenes.push({ who, lines });

  // Пульс — the opening (openingLine): quiet, then every verdict; the day's meeting under it
  const openings = [
    lanes({}),
    lanes({ work: [task({ title: "Отчёт", who: "Марат Сейтов" })] }),
    lanes({ work: [task({ title: "Отчёт", who: "Марат Сейтов", deadline: at(0, 18) }), task({ title: "КП по Казхрому", who: "Динара Ким", deadline: at(1, 13) })] }),
    lanes({ work: [task({ title: "Подготовить пропуска на склад для подрядчика", who: "Ерлан Бекпаев", deadline: at(2, 18) })] }),
    lanes({ work: [task({ title: "Сверка", deadline: at(9, 10) })] }),
    lanes({ overdue: many(1) }),
    lanes({ overdue: many(1), review: many(2) }),
    lanes({ overdue: many(2), declined: many(1), question: [task({ ask: true }), ...many(3)], review: many(4) }),
    lanes({ declined: many(1) }),
    lanes({ question: [task({ ask: true }), task()], review: many(1) }),
    lanes({ question: many(2) }),
    lanes({ review: many(3) }),
  ];
  for (const l of openings) {
    for (const event of [null, ...MEETINGS]) {
      const opening = openingLine(l, NOW, "Асхат");
      add("Пульс", event ? [opening, calendarLine(event)] : [opening]);
    }
  }
  add("Пульс", [openingLine(lanes({}), new Date("2026-11-18T13:00:00Z"), "Асхат")]);

  // Пульс — the phrase in hand («Понял так: …», as the screen builds it), sending, not understood, loading
  const phrases = [
    [entity("task")],
    [entity("task"), entity("task"), entity("task"), entity("announcement")],
    [entity("task"), entity("task"), entity("reminder"), entity("event")],
    [entity("task", "assignee_unmatched")],
    [entity("event", "time_missing")],
    [entity("points"), entity("points")],
    [entity("points", "points_blocked")],
  ];
  for (const entities of phrases) {
    const sendable = entities.filter((e) => isSendable(e, false)).length;
    const why = whyNothingToSend(entities, false);
    add("Пульс", [{ text: `Понял так: ${entitiesSummary(entities)}.${sendable > 0 ? "" : ` ${why}`}`, tone: sendable > 0 ? "ok" : "warn" }]);
  }
  add("Пульс", [{ text: "Отправляю…", tone: "ok" }]);
  add("Пульс", [{ text: "Не разобрал: не нашёл здесь ни задачи, ни объявления.", tone: "warn" }]);
  add("Пульс", [{ text: "Смотрю, что нового…" }]);

  // Пульс — answers to the director's questions (an exchange's lines carry no tone)
  const people = [
    { id: "t", fullName: "Тимур Ахметов", aliases: [] },
    { id: "m", fullName: "Марат Сейтов", aliases: [] },
    { id: "a", fullName: "Әсем Нұрланқызы", aliases: [] },
  ];
  const brief = (title: string, assignee: string | null, deadline: string | null, assigneeId?: string) => ({ id: title, title, assignee, deadline, assigneeId });
  const open = [
    { ...brief("Сверка с поставщиком", "Тимур", at(-2, 18), "t"), status: "accepted" as const },
    { ...brief("Пропуска на склад", "Тимур", at(2, 18), "t"), status: "rework" as const },
    { ...brief("КП по Казхрому", "Марат", at(1, 13), "m"), status: "sent" as const },
    { ...brief("Договор с Казцинком", "Динара", null, "d"), status: "accepted" as const },
    { ...brief("Тендер", "Әсем", at(3, 10), "a"), status: "accepted" as const },
  ];
  const base: Omit<AnswerInput, "question"> = {
    now: NOW,
    people,
    open,
    closed: [{ ...brief("Отчёт по складу", "Марат", null, "m"), status: "done", closedAt: at(-1, 16, 20) }],
    overdue: [open[0]!],
    declined: [{ ...brief("Командировка в Атырау", "Динара", null, "d"), reason: "занята срочным" }],
    questions: [open[2]!],
    review: [brief("Отчёт", "Марат", at(0, 18), "m")],
  };
  const ask = (input: Omit<AnswerInput, "question">, question: string) => add("Пульс", answer({ ...input, question }).lines.map((text) => ({ text })));
  for (const q of ["кто просрочил", "кто отказался", "что на приёмке", "какие вопросы", "что у Тимура", "что у Әсем", "что по Казхрому", "что по складу", "итоги недели", "что у нас", "погода завтра"]) ask(base, q);
  const none = { ...base, overdue: [], declined: [], questions: [], review: [] };
  for (const q of ["кто просрочил", "кто отказался", "что на приёмке", "какие вопросы"]) ask(none, q);
  ask({ ...base, open: [] }, "что у Тимура");
  ask({ ...base, declined: [...base.declined!, { ...brief("Выставка", "Тимур", null, "t"), reason: null }] }, "кто отказался");

  // Лента — the greeting, what waits, the evening report, the day's meeting, in the screen's order
  const employee = [
    lanes({ work: work(["sent"]) }),
    lanes({ work: work(["sent", "sent", "rework", "accepted"]) }),
    lanes({ work: work(["rework"]) }),
    lanes({ overdue: work(["accepted"]), work: work(["accepted"]) }),
    lanes({ overdue: work(["accepted", "accepted"]), work: work(["sent", "rework"]) }),
    lanes({ work: work(["accepted", "accepted"]) }),
    lanes({ review: work(["pending_review", "pending_review"]) }),
    lanes({}),
  ];
  const waits = [
    null,
    { unread: [{ title: "Пропуска" }], unacked: 1, invites: [{ title: "Планёрка", startsAt: at(0, 11, 30) }] },
    { unread: [{ title: "Подготовить пропуска на склад для подрядчика" }], unacked: 0, invites: [] },
    { unread: [], unacked: 1, invites: [] },
    { unread: [], unacked: 2, invites: [] },
    { unread: [{ title: "a" }, { title: "b" }], unacked: 0, invites: [] },
    { unread: [], unacked: 0, invites: [{ title: "Разбор квартала", startsAt: at(1, 9) }] },
    { unread: [], unacked: 0, invites: [{ title: "Планёрка", startsAt: at(0, 11, 30) }, { title: "Разбор", startsAt: at(2, 9) }] },
  ].map((w) => (w ? employeeWaiting(w, NOW) : null));
  const reports = [null, reportPhrase({ asking: true, oneTap: true }), reportPhrase({ asking: true, oneTap: false })];
  for (const l of employee) {
    for (const report of reports) {
      const opening = employeeOpening(l, NOW, "Айгуль", { reportPending: report !== null });
      for (const waiting of waits) {
        // at rest and over a card: the greeting and the one line that matters most
        const first = report ?? waiting;
        add("Лента", first ? [opening, first] : [opening]);
        // on the ring: what waits, the report, the meeting — three lines at most
        const ring: Line[] = [opening];
        if (waiting) ring.push(waiting);
        if (report) ring.push(report);
        if (ring.length < 3) ring.push(calendarLine(MEETINGS[0]!));
        add("Лента", ring);
      }
    }
  }
  add("Лента", [{ text: "Смотрю, что нового…" }]);
  return scenes;
}

const SCENES = buildCorpus();
const withIds = (lines: Line[]): SaidLine[] => lines.map((line, i) => ({ id: String(i), ...line }));
/** Every distinct line of the corpus, the first one of a reply marked as its headline. */
const LINES = [...new Map(SCENES.flatMap((s) => s.lines).map((l) => [`${l.tone}|${l.text}`, l])).values()];

/** The body of a line: what follows the greeting. */
const bodyOf = (text: string) => {
  const greeting = GREETING.exec(text);
  return greeting ? text.slice(greeting[0].length) : text;
};
const textOf = (tokens: Token[]) => tokens.map((t) => ("space" in t ? t.space : t.frags.map((f) => f.text).join(""))).join("");
const wordsOf = (tokens: Token[]) => tokens.filter((t): t is Word => "word" in t);
const verdictOf = (pieces: Piece[]) => pieces.filter((p) => p.look === "verdict").map((p) => p.text);
/** The tint of every coloured run of a line: not grey, not white. */
const huesIn = (tokens: Token[]) => wordsOf(tokens).flatMap((w) => w.frags.map((f) => f.ink.split(" ")[0]).filter((tint) => tint && tint !== "text"));

describe("the corpus", () => {
  it("is built from the builders and is not small", () => {
    expect(SCENES.length).toBeGreaterThan(400);
    expect(LINES.length).toBeGreaterThan(60);
    // both sides and every tone
    expect(new Set(SCENES.map((s) => s.who))).toEqual(new Set(["Пульс", "Лента"]));
    expect(new Set(LINES.map((l) => l.tone))).toEqual(new Set(["danger", "warn", "ok", undefined]));
  });
});

/* -------------------------------------------------------------------------- */
/* Reading a line                                                              */
/* -------------------------------------------------------------------------- */

describe("piecesOf — on the whole corpus", () => {
  it("cuts a line into pieces that put together are the line", () => {
    for (const { text, tone } of LINES) {
      const body = bodyOf(text);
      expect(piecesOf(body, tone).map((p) => p.text).join(""), text).toBe(body);
    }
  });

  it("colours one unit a line at most", () => {
    for (const { text, tone } of LINES) expect(verdictOf(piecesOf(bodyOf(text), tone)).length, text).toBeLessThanOrEqual(1);
  });

  it("colours only a danger, warn or ok line — in that line's own tone", () => {
    for (const scene of SCENES) {
      const { said } = sayAll(withIds(scene.lines));
      for (const [i, line] of said.entries()) {
        const tokens = [...(line.kicker ?? []), ...line.body];
        const hue = hueOf(scene.lines[i]!.tone);
        const hues = huesIn(tokens);
        if (!hue) expect(hues, textOf(line.body)).toEqual([]);
        else expect(new Set(hues).size <= 1 && hues.every((h) => h === hue), textOf(line.body)).toBe(true);
        // the coloured words are one unit: side by side, nothing between them
        const lit = wordsOf(tokens).flatMap((w, i) => (w.anim === "flare" ? [i] : []));
        if (lit.length > 0) expect(lit[lit.length - 1]! - lit[0]!, textOf(line.body)).toBe(lit.length - 1);
        for (const w of wordsOf(tokens)) expect(w.anim === "flare" ? w.hue : undefined, w.word).toBe(w.anim === "flare" ? hue : undefined);
      }
    }
  });

  it("never colours a count whose own clause says «no», «none» or zero", () => {
    // the clause a piece stands in: between the stops and commas around it
    const clauseAround = (body: string, piece: string) => {
      const at = body.indexOf(piece);
      const from = Math.max(...[",", ".", ";", ":", "!", "?", "—", "–"].map((stop) => body.lastIndexOf(stop, at - 1))) + 1;
      const ends = [",", ".", ";", ":", "!", "?", "—", "–"].map((stop) => body.indexOf(stop, at + piece.length)).filter((i) => i >= 0);
      return body.slice(from, ends.length > 0 ? Math.min(...ends) : body.length);
    };
    let seen = 0;
    for (const { text, tone } of LINES) {
      const body = bodyOf(text);
      if (!NEGATION.test(body)) continue;
      seen += 1;
      for (const verdict of verdictOf(piecesOf(body, tone))) {
        if (/\d|^(?:один|одна|одно|одну)\s/iu.test(verdict)) expect(clauseAround(body, verdict), text).not.toMatch(NEGATION);
      }
    }
    expect(seen).toBeGreaterThan(5);
  });

  it("reads the assistant's own words as plain words, not as facts", () => {
    let seen = 0;
    for (const { text, tone } of LINES) {
      const body = bodyOf(text);
      if (!SERVICE.test(body)) continue;
      seen += 1;
      const pieces = piecesOf(body, tone);
      expect(pieces[0]!.look, text).toBe("plain");
      expect(pieces.some((p) => p.look === "fact"), text).toBe(false);
      // a warning's second sentence is its verdict; nothing else of it is coloured
      const verdicts = verdictOf(pieces);
      if (verdicts.length > 0) expect(tone === "warn" || tone === "danger", text).toBe(true);
    }
    // «Понял так», «Отправляю», «Не разобрал», «Смотрю», «Пока отвечаю только»
    expect(seen).toBeGreaterThanOrEqual(10);
  });
});

describe("piecesOf — how the lines lie", () => {
  it("the employee's red greeting: the overdue count is the verdict, not the first one", () => {
    const text = SCENES.flatMap((s) => s.lines).find((l) => l.text === "Доброе утро, Айгуль. 1 новая задача, 1 на доработке, 2 просрочены.");
    expect(text?.tone).toBe("danger");
    expect(piecesOf(bodyOf(text!.text), text!.tone)).toEqual([
      { text: "1 новая задача", look: "fact", glue: true },
      { text: ", ", look: "quiet" },
      { text: "1 на доработке", look: "fact", glue: true },
      { text: ", ", look: "quiet" },
      { text: "2 просрочены", look: "verdict", glue: true },
      { text: ".", look: "quiet" },
    ]);
  });

  it("the director's red greeting: the first count when it says the tone", () => {
    expect(verdictOf(piecesOf("1 просрочка, 2 на приёмке.", "danger"))).toEqual(["1 просрочка"]);
    expect(verdictOf(piecesOf("2 просрочки, 1 отказ, 1 вопрос, 3 сообщения, 4 на приёмке.", "danger"))).toEqual(["2 просрочки"]);
    expect(verdictOf(piecesOf("1 вопрос, 1 сообщение, 1 на приёмке.", "warn"))).toEqual(["1 вопрос"]);
    expect(verdictOf(piecesOf("3 на приёмке.", "warn"))).toEqual(["3 на приёмке"]);
  });

  it("«Просрочек нет.» — a line with nothing to mark is white in its first sentence, uncoloured", () => {
    expect(piecesOf("Просрочек нет. Все сроки пока держатся.", undefined)).toEqual([
      { text: "Просрочек нет.", look: "plain" },
      { text: " Все сроки пока держатся.", look: "quiet" },
    ]);
  });

  it("«Понял так» stays plain; a warning's missing piece is its verdict", () => {
    expect(piecesOf("Понял так: задача. Не хватает исполнителя.", "warn")).toEqual([
      { text: "Понял так: задача.", look: "plain" },
      { text: " ", look: "quiet" },
      { text: "Не хватает исполнителя.", look: "verdict" },
      { text: "", look: "quiet" },
    ]);
    // «3 задачи» in the assistant's own words is not a count of the board
    expect(piecesOf("Понял так: 3 задачи и объявление.", "ok")).toEqual([
      { text: "Понял так: 3 задачи и объявление.", look: "plain" },
      { text: "", look: "quiet" },
    ]);
    expect(verdictOf(piecesOf("Не разобрал: не нашёл здесь ни задачи, ни объявления.", "warn"))).toEqual([]);
  });

  it("«Всё сдано» is the verdict, the number after the dash a fact", () => {
    expect(piecesOf("Всё сдано, на проверке у директора — 2.", "ok")).toEqual([
      { text: "Всё сдано", look: "verdict", glue: true },
      { text: ", на проверке у директора — ", look: "quiet" },
      { text: "2", look: "fact", glue: true },
      { text: ".", look: "quiet" },
    ]);
  });

  it("the evening report: the whole «Отчёт за день ещё не сдан» is the verdict, the tab stays grey", () => {
    expect(piecesOf("Отчёт за день ещё не сдан — в «Делах» он сдаётся одной кнопкой.", "warn")).toEqual([
      { text: "Отчёт за день ещё не сдан", look: "verdict", glue: true },
      { text: " — в ", look: "quiet" },
      { text: "«Делах»", look: "quiet", quote: true },
      { text: " он сдаётся одной кнопкой.", look: "quiet" },
    ]);
  });

  it("a calm line colours only its verdict words", () => {
    expect(verdictOf(piecesOf("Пока тихо. Задач в работе нет.", "ok"))).toEqual(["Пока тихо"]);
    expect(verdictOf(piecesOf("2 задачи в работе, нового нет.", "ok"))).toEqual(["нового нет"]);
    expect(verdictOf(piecesOf("Дел нет, всё сделано.", "ok"))).toEqual(["Дел нет"]);
  });

  it("a «no» or a zero keeps the counts of its own clause colourless", () => {
    expect(verdictOf(piecesOf("0 просрочек, 2 на приёмке.", "danger"))).toEqual([]);
    expect(verdictOf(piecesOf("Задач в работе нет, 2 на приёмке.", "warn"))).toEqual(["2 на приёмке"]);
    expect(verdictOf(piecesOf("1 просрочка, ответа от Тимура нет.", "danger"))).toEqual(["1 просрочка"]);
  });

  it("red stands only on an overdue or a refusal", () => {
    expect(verdictOf(piecesOf("2 на приёмке, 1 вопрос.", "danger"))).toEqual([]);
    expect(verdictOf(piecesOf("1 отказ, 2 на приёмке.", "danger"))).toEqual(["1 отказ"]);
  });

  it("a muted line or one with no tone has no colour", () => {
    expect(verdictOf(piecesOf("1 вопрос, 1 сообщение, 1 на приёмке.", "muted"))).toEqual([]);
    expect(verdictOf(piecesOf("Пока тихо. Задач в работе нет.", undefined))).toEqual([]);
    // «Ждут вас» without a tone stands up as a fact instead
    expect(piecesOf("Ждут вас: новое объявление.", undefined)[0]).toEqual({ text: "Ждут вас", look: "fact", glue: true });
  });

  it("«Ждут вас»: the head carries the colour, each thing waiting is white and whole", () => {
    expect(piecesOf("Ждут вас: сообщение директора, новое объявление и приглашение на встречу в 11:30.", "warn")).toEqual([
      { text: "Ждут вас", look: "verdict", glue: true },
      { text: ": ", look: "quiet" },
      { text: "сообщение директора", look: "plain", glue: true },
      { text: ", ", look: "quiet" },
      { text: "новое объявление", look: "plain", glue: true },
      { text: " и ", look: "quiet" },
      { text: "приглашение на встречу в 11:30", look: "plain", glue: true },
      { text: ".", look: "quiet" },
    ]);
  });

  it("a Kazakh name is a name; a deadline is one unit", () => {
    expect(piecesOf("Әсем: 1 задача в работе:", undefined).slice(0, 3)).toEqual([
      { text: "Әсем", look: "plain", glue: true },
      { text: ": ", look: "quiet" },
      { text: "1 задача в работе", look: "fact", glue: true },
    ]);
    expect(piecesOf("«Сверка с поставщиком» — в работе, до 16.11 18:00", undefined).at(-1)).toEqual({ text: "до 16.11 18:00", look: "fact", glue: true });
    expect(piecesOf("«Пропуска на склад» — на доработке, до пт 18:00", undefined).at(-1)).toEqual({ text: "до пт 18:00", look: "fact", glue: true });
    // «Принято:», «Отменено:» are not people; a name ending in «о» is one
    expect(piecesOf("Принято: «Отчёт»", "ok")[0]).toEqual({ text: "Принято: ", look: "plain" });
    expect(piecesOf("Марко, «Отчёт» — до пт 18:00", undefined)[0]).toEqual({ text: "Марко", look: "plain", glue: true });
  });

  it("the pinned lines come from the builders as they are", () => {
    const texts = new Set(SCENES.flatMap((s) => s.lines).map((l) => l.text));
    for (const text of [
      "Просрочек нет. Все сроки пока держатся.",
      "Понял так: задача. Не хватает исполнителя.",
      "Доброе утро, Айгуль. Всё сдано, на проверке у директора — 2.",
      "Отчёт за день ещё не сдан — в «Делах» он сдаётся одной кнопкой.",
      "Әсем: 1 задача в работе:",
      "«Сверка с поставщиком» — в работе, до 16.11 18:00",
      "«Пропуска на склад» — на доработке, до пт 18:00",
    ]) {
      expect(texts.has(text), text).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Saying a reply                                                              */
/* -------------------------------------------------------------------------- */

describe("sayAll", () => {
  it("says every line exactly: the greeting row, the space after it, the rest", () => {
    for (const scene of SCENES) {
      const lines = withIds(scene.lines);
      const { said } = sayAll(lines);
      said.forEach((line, i) => {
        expect(textOf(line.kicker ?? []) + line.between + textOf(line.body)).toBe(lines[i]!.text);
        expect(line.head).toBe(i === 0);
        for (const w of wordsOf([...(line.kicker ?? []), ...line.body])) expect(w.frags.map((f) => f.text).join("")).toBe(w.word);
      });
    }
  });

  it("puts the greeting on a quiet row of its own", () => {
    const { said } = sayAll([{ id: "a", text: "Доброе утро, Асхат. 1 просрочка, 2 на приёмке.", tone: "danger" }]);
    const line = said[0]!;
    expect(textOf(line.kicker!)).toBe("Доброе утро, Асхат.");
    expect(line.between).toBe(" ");
    expect(wordsOf(line.kicker!).every((w) => w.greet && w.anim === "rise" && w.frags.every((f) => f.ink === ""))).toBe(true);
    expect(wordsOf(line.body).some((w) => w.greet)).toBe(false);
    // the verdict flares in red, its comma in the light weight; the next count is a white fact of the headline
    expect(wordsOf(line.body).map((w) => [w.word, w.anim, w.frags.map((f) => f.ink)])).toEqual([
      ["1", "flare", ["danger bold"]],
      ["просрочка,", "flare", ["danger bold", "danger"]],
      ["2", "shine", ["text bold"]],
      ["на", "shine", ["text bold"]],
      ["приёмке.", "shine", ["text bold", "text"]],
    ]);
  });

  it("stands up at most two facts of a headline; a wall of counts keeps only its verdict", () => {
    const busy = sayAll([{ id: "a", text: "2 просрочки, 1 отказ, 1 вопрос, 3 сообщения, 4 на приёмке.", tone: "danger" }]).said[0]!;
    expect(wordsOf(busy.body).filter((w) => w.anim === "shine")).toEqual([]);
    expect(wordsOf(busy.body).filter((w) => w.anim === "flare").map((w) => w.word)).toEqual(["2", "просрочки,"]);
    // under the headline a fact is white in the light weight
    const detail = sayAll([{ id: "a", text: "Тимур:" }, { id: "b", text: "«Отчёт» — до пт 18:00" }]).said[1]!;
    expect(wordsOf(detail.body).filter((w) => w.word !== "—").every((w) => w.anim === "rise" && w.frags.every((f) => f.ink === "text"))).toBe(true);
  });

  it("one clock through the whole reply: in reading order, the last word out by 0.8 s", () => {
    for (const scene of SCENES) {
      const { said, last } = sayAll(withIds(scene.lines));
      const words = said.flatMap((line) => wordsOf([...(line.kicker ?? []), ...line.body]));
      expect(words[0]!.at).toBe(0);
      for (let i = 1; i < words.length; i++) expect(words[i]!.at).toBeGreaterThanOrEqual(words[i - 1]!.at);
      expect(last).toBe(words[words.length - 1]!.at);
      expect(last).toBeLessThanOrEqual(LAST_MAX_S + 1e-9);
      // even after the last reply's ghost has had its moment
      expect(last + GHOST_SHIFT_S).toBeLessThanOrEqual(0.86 + 1e-9);
      // a few words are said in 0.45 s at most
      if (words.length < 6) expect(last).toBeLessThanOrEqual(0.45 + 1e-9);
    }
  });

  it("says only the new lines: a line that stays is not said again", () => {
    const greeting: SaidLine = { id: "a", text: "Доброе утро, Асхат. 1 просрочка, 2 на приёмке.", tone: "danger" };
    const meetingLine: SaidLine = { id: "calendar", text: "Сегодня в 15:00 — «Планёрка», 6 человек" };
    const { said, last } = sayAll([greeting, meetingLine], new Set([lineKeyOf(greeting)]));
    // the added line sets out at once, not after the greeting already on screen
    expect(wordsOf(said[1]!.body)[0]!.at).toBe(0);
    // its clock is its own six words, not the greeting's eight before them
    expect(last).toBeCloseTo(sayAll([meetingLine]).last, 9);
    // a line whose words changed is a new line, said again
    expect(lineKeyOf({ ...greeting, text: "Доброе утро, Асхат. 2 просрочки." })).not.toBe(lineKeyOf(greeting));
  });

  it("a long reply takes the whole 0.8 s, a short one about 0.45", () => {
    const tim = answer({ now: NOW, people: [{ id: "t", fullName: "Тимур Ахметов", aliases: [] }], open: [
      { id: "1", title: "Сверка с поставщиком", assignee: "Тимур", assigneeId: "t", deadline: at(-2, 18), status: "accepted" },
      { id: "2", title: "Пропуска на склад", assignee: "Тимур", assigneeId: "t", deadline: at(2, 18), status: "rework" },
    ], overdue: [], questions: [], review: [], question: "что у Тимура" });
    expect(sayAll(tim.lines.map((text, i) => ({ id: String(i), text }))).last).toBeCloseTo(0.8, 6);
    expect(sayAll([{ id: "a", text: "Тимур: задач в работе нет." }]).last).toBeCloseTo(0.45, 6);
    expect(sayAll([{ id: "a", text: "Отправляю…", tone: "ok" }]).last).toBe(0);
    expect(sayAll([]).last).toBe(0);
  });

  it("breathes after a full stop, a colon, a comma and a line", () => {
    const { said } = sayAll([{ id: "a", text: "Тимур: 2 задачи в работе, 1 с просрочкой:" }, { id: "b", text: "«Сверка с поставщиком» — в работе, до 16.11 18:00" }]);
    const words = said.flatMap((line) => wordsOf(line.body));
    const gapAfter = (word: string) => {
      const i = words.findIndex((w) => w.word === word);
      return words[i + 1]!.at - words[i]!.at;
    };
    // the breaths are squeezed with the rest in a long reply, never below their order
    expect(gapAfter("просрочкой:")).toBeGreaterThan(gapAfter("работе,"));
  });
});

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

describe("runsOf", () => {
  const runsOfLine = (text: string, tone?: SpeechTone) => runsOf(sayAll([{ id: "a", text, tone }]).said[0]!.body);
  const runText = (run: Token[]) => textOf(run);

  it("keeps a deadline, a count and a name on one row", () => {
    expect(runsOfLine("«Сверка с поставщиком» — в работе, до 16.11 18:00").map(runText)).toContain("до 16.11 18:00");
    expect(runsOfLine("«Пропуска на склад» — на доработке, до пт 18:00").map(runText)).toContain("до пт 18:00");
    expect(runsOfLine("1 просрочка, 2 на приёмке.", "danger").map(runText)).toEqual(["1 просрочка,", " ", "2 на приёмке."]);
    expect(runsOfLine("Ерлан Б.: 3 задачи в работе:").map(runText)[0]).toBe("Ерлан Б.:");
  });

  it("never opens a row with a dash, never ends one on a short word", () => {
    const short = /^(?:\d+|\p{L}{1,3})$/u;
    for (const scene of SCENES) {
      for (const line of sayAll(withIds(scene.lines)).said) {
        const tokens = line.body;
        if (wordsOf(tokens).some((w) => w.word.length >= LONG_WORD)) continue;
        const runs = runsOf(tokens);
        expect(runs.flat()).toEqual(tokens);
        runs.forEach((run, i) => {
          const words = wordsOf(run);
          if (i > 0 && words.length > 0) expect(words[0]!.word, runText(run)).not.toMatch(/^[—–]/u);
          if (i < runs.length - 1 && words.length > 0) expect(words[words.length - 1]!.word, runText(run)).not.toMatch(short);
        });
      }
    }
  });
});
