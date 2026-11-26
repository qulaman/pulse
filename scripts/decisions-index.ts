/**
 * The head of the decisions register (D-201). Decisions live in decisions/<area>.md, one entry
 * each; DECISIONS.md keeps what every session reads — the summary, the owner's queue and a
 * pointer. Three parts of that head are derived from the entries and are never typed by hand:
 * the list of visas, the table "which file holds which number" and the next free number.
 *
 * Built from the files alone, so the same entries always give the same text:
 * tests/decisions-index.test.ts fails when an entry lands without the head being rebuilt, when
 * an entry outgrows ENTRY_LIMIT, or when a number is used twice.
 *
 *   pnpm decisions:index     rewrite the generated blocks of DECISIONS.md
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const HEAD_PATH = join(ROOT, "DECISIONS.md");
export const REGISTER_DIR = join(ROOT, "decisions");

/** An entry says what is decided and points at the area document for how the screen behaves. */
export const ENTRY_LIMIT = 1500;

/** The order of areas in the head; a file that is not listed goes last, by name. */
const AREA_ORDER = [
  "product",
  "tasks",
  "task-messages",
  "delivery",
  "voice",
  "home",
  "mascot",
  "notes",
  "calendar",
  "secretary",
  "points",
  "daily-report",
  "wall",
  "desk",
  "ops",
  "people",
  "design",
  "process",
];

const MARKS = ["✅", "🟡", "◐", "⛔", "🔴"];
const WAITS_VISA = "🟡";

export type Entry = {
  /** `D-128`, `G.20`, `V-01` — never renumbered: the code cites them. */
  id: string;
  title: string;
  /** `✅ действует`, `🟡 ждёт визы`, `⛔ заменено D-134` … */
  mark: string;
  /** The one question to the owner, in plain words; only entries waiting for a visa need it. */
  visa: string | null;
  /** Code points, the heading line included; the visa line is the owner's question and is not counted. */
  length: number;
};

export type Area = { file: string; title: string; entries: Entry[]; problems: string[] };

const lf = (text: string) => text.split("\r\n").join("\n");

function areaRank(file: string): number {
  const at = AREA_ORDER.indexOf(file.replace(/\.md$/, ""));
  return at === -1 ? AREA_ORDER.length : at;
}

function readArea(dir: string, file: string): Area {
  const lines = lf(readFileSync(join(dir, file), "utf8")).split("\n");
  const problems: string[] = [];
  const title = lines[0]?.startsWith("# ") ? lines[0].slice(2).trim() : "";
  if (!title) problems.push(`${file}: первая строка должна быть «# Название области»`);

  const starts = lines.flatMap((line, i) => (line.startsWith("### ") ? [i] : []));
  const entries = starts.map((start, n) => {
    // an entry ends at the next heading of any level, so text between entries is not counted into it
    const after = lines.findIndex((line, i) => i > start && /^#{1,3} /.test(line));
    const body = lines.slice(start, after === -1 ? lines.length : Math.min(after, starts[n + 1] ?? lines.length));
    const counted = body.filter((line) => !line.startsWith("**Виза.**")).join("\n").trim();
    const heading = body[0];
    const id = /^### (\S+?)\. /.exec(heading)?.[1] ?? "";
    const split = heading.lastIndexOf(" · ");
    const mark = split === -1 ? "" : heading.slice(split + 3).trim();
    const entryTitle = heading.slice(4 + id.length + 2, split === -1 ? undefined : split).trim();
    const visaLine = body.find((line) => line.startsWith("**Виза.**"));

    if (!/^(D-\d+|V-\d+|[GH]\.\d+)$/.test(id)) problems.push(`${file}: не разобрал номер в «${heading}»`);
    if (!MARKS.some((m) => mark.startsWith(m))) problems.push(`${file}: у ${id || heading} нет метки после « · »`);
    return {
      id,
      title: entryTitle,
      mark,
      visa: visaLine ? visaLine.slice("**Виза.**".length).trim() : null,
      length: [...counted].length,
    };
  });
  return { file, title, entries, problems };
}

export function readRegister(dir: string = REGISTER_DIR): Area[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort((a, b) => areaRank(a) - areaRank(b) || a.localeCompare(b))
    .map((file) => readArea(dir, file));
}

/** What keeps the register from being trusted: each line names the file and the entry. */
export function registerProblems(areas: Area[], head = ""): string[] {
  const out = areas.flatMap((area) => area.problems);
  const seen = new Map<string, string>();
  const held = new Set(reservedNumbers(head).map((n) => `D-${n}`));
  for (const area of areas) {
    for (const entry of area.entries) {
      if (!entry.id) continue; // its heading is already reported as unreadable
      const first = seen.get(entry.id);
      if (first) out.push(`${entry.id} записан дважды: ${first} и ${area.file}`);
      else seen.set(entry.id, area.file);
      if (held.has(entry.id)) out.push(`${entry.id} уже записан в ${area.file} — убери строку «${entry.id} занят» из «Нумерации»`);
      if (entry.length > ENTRY_LIMIT) {
        out.push(`${area.file}: ${entry.id} — ${entry.length} знаков, предел ${ENTRY_LIMIT} без строки «Виза»; поведение экрана — в документ области`);
      }
      if (entry.mark.startsWith(WAITS_VISA) && !entry.visa) {
        out.push(`${area.file}: ${entry.id} ждёт визы, но строки «**Виза.**» в записи нет`);
      }
    }
  }
  return out;
}

/**
 * Numbers a session has taken before its entry is written — the code already cites them. One
 * line each under «Нумерация» of the head: `- D-204 занят …`. Without it two sessions working
 * side by side read the same "next free number".
 */
export function reservedNumbers(head: string): number[] {
  return [...lf(head).matchAll(/^- D-(\d+) занят/gm)].map((match) => Number(match[1]));
}

export function nextFreeNumber(areas: Area[], head = ""): number {
  const numbers = areas.flatMap((area) => area.entries.flatMap((e) => (e.id.startsWith("D-") ? [Number(e.id.slice(2))] : [])));
  return Math.max(0, ...numbers, ...reservedNumbers(head)) + 1;
}

function renderVisas(areas: Area[]): string {
  const waiting = areas
    .map((area) => ({ area, entries: area.entries.filter((e) => e.mark.startsWith(WAITS_VISA)) }))
    .filter((group) => group.entries.length > 0);
  const total = waiting.reduce((sum, group) => sum + group.entries.length, 0);
  const out = [`Ждут визы — ${total}. Каждая строка — уже построенное. Вопрос один: оставить так?`];
  for (const { area, entries } of waiting) {
    out.push("", `**${area.title}**`, "");
    for (const entry of entries) out.push(`- ${entry.id}. ${entry.visa ?? `${entry.title} — оставить так?`}`);
  }
  return out.join("\n");
}

function renderPointer(areas: Area[], head: string): string {
  const out = [
    `Следующий свободный номер — D-${nextFreeNumber(areas, head)}.`,
    "",
    "| Область | Файл | Решения |",
    "|---|---|---|",
  ];
  for (const area of areas) {
    out.push(`| ${area.title} | \`decisions/${area.file}\` | ${area.entries.map((e) => e.id).join(", ")} |`);
  }
  return out.join("\n");
}

function fill(head: string, block: string, body: string): string {
  const start = `<!-- decisions:${block}:start -->`;
  const end = `<!-- decisions:${block}:end -->`;
  const from = head.indexOf(start);
  const to = head.indexOf(end);
  if (from === -1 || to === -1 || to < from) throw new Error(`DECISIONS.md: нет меток блока decisions:${block}`);
  return `${head.slice(0, from + start.length)}\n${body}\n${head.slice(to)}`;
}

/** The head with its generated blocks rebuilt; everything outside the marks is left as typed. */
export function renderHead(head: string, areas: Area[] = readRegister()): string {
  return fill(fill(lf(head), "visas", renderVisas(areas)), "register", renderPointer(areas, head));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const areas = readRegister();
  const head = renderHead(readFileSync(HEAD_PATH, "utf8"), areas);
  writeFileSync(HEAD_PATH, head);
  const entries = areas.reduce((sum, area) => sum + area.entries.length, 0);
  console.log(`DECISIONS.md: ${entries} решений в ${areas.length} файлах, следующий номер D-${nextFreeNumber(areas, head)}`);
  const problems = registerProblems(areas, head);
  for (const line of problems) console.error(`  ! ${line}`);
  if (problems.length > 0) process.exitCode = 1;
}
