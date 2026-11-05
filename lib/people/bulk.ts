import { fold } from "@/lib/desk/suggest";

import { cleanPhone, phoneLooksRight } from "./phone";

/**
 * «Списком» on the desk's new person (D-153, the launch of a company): lines pasted from Excel or
 * from any text become rows to look at before anything is created. Pure: the screen renders, this
 * reads. A line is `ФИО, должность, телефон`; the separator is the line's own — a tab (Excel), else
 * «;», else «,». What is plainly the phone is found wherever it stands, so swapped columns and a
 * phone written straight after a name without any separator still read right. Nothing is created
 * silently: a row that cannot go says why, a row that looks like somebody already here waits for
 * a word from the person.
 */

/** The limits of `POST /api/people`'s schema: a row over them would only come back refused. */
export const NAME_MIN = 2;
export const NAME_MAX = 120;
export const POSITION_MAX = 120;
/** One list at a time: people go one request after another, a longer paste is a mistake or an hour's wait. */
export const BULK_MAX = 300;

export type BulkRow = {
  /** The line of the paste, from 1 — what the row is called and kept apart by. */
  line: number;
  raw: string;
  full_name: string;
  position: string;
  phone: string;
  /** Why the row cannot go; empty — it can. */
  problems: string[];
};

export type RosterPerson = { id: string; full_name: string; is_active: boolean };

/** `same` — the same words of a name, `like` — one name is a part of the other, `list` — an earlier row of this very list. */
export type BulkMatch = { kind: "same" | "like"; person: RosterPerson } | { kind: "list"; line: number };

export type BulkItem = BulkRow & { match: BulkMatch | null };

/** Non-breaking spaces and runs of spaces are Excel's: a cell is its words. */
function tidy(text: string): string {
  return text.replace(/[\s ]+/g, " ").trim();
}

/** One line into cells; a cell in double quotes may hold the separator (CSV). */
function splitCells(line: string, separator: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let at = 0; at < line.length; at += 1) {
    const char = line[at];
    if (quoted) {
      if (char === '"' && line[at + 1] === '"') {
        cell += '"';
        at += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (char === separator) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map(tidy);
}

function cellsOf(line: string): string[] {
  const separator = line.includes("\t") ? "\t" : line.includes(";") ? ";" : line.includes(",") ? "," : null;
  return separator ? splitCells(line, separator) : [tidy(line)];
}

const digitCount = (text: string) => text.replace(/\D/g, "").length;

/** «тел. +7 701…» — the word is not part of the number. */
function withoutPhoneWord(cell: string): string {
  return cell.replace(/^(тел(ефон)?|моб(ильный)?|сот(овый)?|phone)[.:]?\s*/i, "");
}

/** A cell that is plainly a phone: the form's shape and enough digits — «2024» is no phone. */
function isPhone(cell: string): boolean {
  return cell !== "" && phoneLooksRight(cell) && digitCount(cell) >= 7;
}

/** Digits in bulk that are not a phone's shape, or Excel's «7,70E+10»: a phone with a typo, not a position. */
function isBrokenPhone(cell: string): boolean {
  return /^\d[\d.,]*e\+?\d+$/i.test(cell) || (!isPhone(cell) && digitCount(cell) >= 7);
}

type Column = "name" | "position" | "phone";

const HEADER: Record<Column, RegExp> = {
  name: /^(фио|ф\.\s?и\.\s?о\.?|имя|имя и фамилия|фамилия и имя|фамилия имя|фамилия имя отчество|фамилия,? имя,? отчество|сотрудник|работник|name|full name)$/i,
  position: /^(должность|позиция|position|title)$/i,
  phone: /^(телефон|тел\.?|номер телефона|мобильный|сотовый|phone|mobile)$/i,
};

/** The first line as a head of columns, when it is one: which cell holds what. Without a name column it is a person. */
function headerOf(cells: readonly string[]): Partial<Record<Column, number>> | null {
  if (cells.some(isPhone)) return null;
  const map: Partial<Record<Column, number>> = {};
  cells.forEach((cell, index) => {
    for (const column of ["name", "position", "phone"] as const) {
      if (HEADER[column].test(cell) && map[column] === undefined) map[column] = index;
    }
  });
  return map.name === undefined ? null : map;
}

/** A leading row number — a cell of its own («1», «12.») or the start of the only cell («1. Иванов»). */
function withoutOrdinal(cells: readonly string[]): string[] {
  if (cells.length > 1 && /^\d{1,4}[.)]?$/.test(cells[0])) return cells.slice(1);
  return cells.map((cell, index) => (index === 0 ? cell.replace(/^\d{1,4}[.)]\s+/, "") : cell));
}

/** A line with no separator: the phone can only be what stands at its end. */
function tailPhone(cell: string): [string, string] | null {
  const match = /^(.*?\S)\s+(\+?[\d(][\d() .-]{5,})$/.exec(cell);
  return match && isPhone(match[2]) ? [match[1], match[2]] : null;
}

/** Who, what and which phone by the position of the cells, the phone found wherever it stands. */
function readCells(source: readonly string[]): Pick<BulkRow, "full_name" | "position" | "phone"> {
  const cells = withoutOrdinal(source).map(withoutPhoneWord);
  while (cells.length > 1 && cells[cells.length - 1] === "") cells.pop();

  if (cells.length === 1) {
    const tail = tailPhone(cells[0]);
    return tail ? { full_name: tail[0], position: "", phone: tail[1] } : { full_name: cells[0], position: "", phone: "" };
  }

  let phoneAt = -1;
  for (let at = cells.length - 1; at >= 0 && phoneAt < 0; at -= 1) if (isPhone(cells[at])) phoneAt = at;
  for (let at = cells.length - 1; at >= 1 && phoneAt < 0; at -= 1) if (isBrokenPhone(cells[at])) phoneAt = at;
  // the third column is the phone's: a short town number is written there too
  if (phoneAt < 0 && cells.length >= 3 && digitCount(cells[2]) >= 5 && cells[2].replace(/[\d() .+-]/g, "") === "") phoneAt = 2;

  const phone = phoneAt >= 0 ? cells[phoneAt] : "";
  const rest = cells.filter((_, at) => at !== phoneAt);
  return { full_name: rest[0] ?? "", position: rest.slice(1).filter(Boolean).join(", "), phone };
}

/** What stops a row, in the words the preview says. */
function problemsOf(full_name: string, position: string, phone: string): string[] {
  const problems: string[] = [];
  if (full_name.length < NAME_MIN || !/\p{L}/u.test(full_name)) problems.push("Нет имени");
  else if (full_name.length > NAME_MAX) problems.push(`Имя длиннее ${NAME_MAX} знаков`);
  else if (/\d/.test(full_name)) problems.push("В имени цифры — проверьте столбцы");
  if (position.length > POSITION_MAX) problems.push(`Должность длиннее ${POSITION_MAX} знаков`);
  if (!phoneLooksRight(phone)) problems.push("Похоже, в телефоне опечатка");
  return problems;
}

/** The pasted text into rows; blank lines and a head of columns are not rows, and line numbers stay the paste's own. */
export function parseBulk(text: string): BulkRow[] {
  const lines = text.split(/\r\n|\r|\n/);
  const first = lines.findIndex((line) => line.trim() !== "");
  if (first < 0) return [];
  const header = headerOf(cellsOf(lines[first]));

  const rows: BulkRow[] = [];
  lines.forEach((raw, index) => {
    if (raw.trim() === "" || (header && index === first)) return;
    const cells = cellsOf(raw);
    const read = header
      ? {
          full_name: cells[header.name as number] ?? "",
          position: header.position === undefined ? "" : (cells[header.position] ?? ""),
          phone: header.phone === undefined ? "" : withoutPhoneWord(cells[header.phone] ?? ""),
        }
      : readCells(cells);
    rows.push({ line: index + 1, raw: raw.trim(), ...read, problems: problemsOf(read.full_name, read.position, read.phone) });
  });
  return rows;
}

const nameWords = (name: string) => fold(name).split(/[\s-]+/).filter(Boolean);

/** A name whatever the order of its words and the case: «Иванов Иван» is «иван иванов». */
export function nameKey(name: string): string {
  return nameWords(name).sort().join(" ");
}

/** One name is a part of the other: «Ерлан» and «Ерлан Досов», with or without a patronymic. */
function namesOverlap(a: readonly string[], b: readonly string[]): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length > 0 && short.every((word) => long.includes(word));
}

/** Everyone a row may be: the same name first, a working person before a fired one. */
function matchOf(words: readonly string[], key: string, roster: readonly RosterPerson[]): BulkMatch | null {
  const ordered = [...roster].sort((a, b) => Number(b.is_active) - Number(a.is_active));
  const same = ordered.find((person) => nameKey(person.full_name) === key);
  if (same) return { kind: "same", person: same };
  const like = ordered.find((person) => namesOverlap(words, nameWords(person.full_name)));
  return like ? { kind: "like", person: like } : null;
}

/** Who each row may already be: somebody on the roster, or an earlier row of the list. A row that cannot go is not compared. */
export function matchRows(rows: readonly BulkRow[], roster: readonly RosterPerson[]): BulkItem[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    if (row.problems.length > 0) return { ...row, match: null };
    const key = nameKey(row.full_name);
    const fromRoster = matchOf(nameWords(row.full_name), key, roster);
    const earlier = seen.get(key);
    if (earlier === undefined) seen.set(key, row.line);
    return { ...row, match: fromRoster ?? (earlier === undefined ? null : { kind: "list", line: earlier }) };
  });
}

/** What goes: no problem, and no likeness unless the person said «всё равно добавить». */
export function rowsToAdd<T extends Pick<BulkItem, "line" | "problems" | "match">>(items: readonly T[], forced: ReadonlySet<number>): T[] {
  return items.filter((item) => item.problems.length === 0 && (item.match === null || forced.has(item.line)));
}

/** The body of `POST /api/people` for a row: the phone exactly as the one-person form sends it. */
export function personBody(row: Pick<BulkRow, "full_name" | "position" | "phone">, role: string) {
  return {
    full_name: row.full_name,
    role,
    position: row.position || undefined,
    phone: cleanPhone(row.phone) ?? undefined,
  };
}

export type BulkOutcome = { line: number; id: string; error?: undefined } | { line: number; id?: undefined; error: string };

/** One after another, never at once: a failure is the row's alone, the next row still goes. */
export async function addInTurn<T extends { line: number }>(
  rows: readonly T[],
  add: (row: T) => Promise<string>,
  onOutcome: (outcome: BulkOutcome) => void = () => undefined,
): Promise<BulkOutcome[]> {
  const outcomes: BulkOutcome[] = [];
  for (const row of rows) {
    let outcome: BulkOutcome;
    try {
      outcome = { line: row.line, id: await add(row) };
    } catch (error) {
      outcome = { line: row.line, error: error instanceof Error && error.message ? error.message : "Не получилось создать" };
    }
    outcomes.push(outcome);
    onOutcome(outcome);
  }
  return outcomes;
}
