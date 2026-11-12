/**
 * The pointer into supabase/migrations (D-162): for every function, table, policy, trigger and
 * enum — the migration that holds its definition in force. A function is redefined as a whole
 * copy each time (Postgres has no other way), so the same name lives in up to eight files and
 * only the last one counts; this index says which.
 *
 * Built from the files alone — no database, no network. The output carries no date, so the same
 * migrations always give the same text: tests/schema-index.test.ts fails when a migration lands
 * without the index being rebuilt.
 *
 *   pnpm db:index        rewrite supabase/SCHEMA.md
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
export const INDEX_PATH = join(ROOT, "supabase", "SCHEMA.md");

type Place = { file: string; line: number };
type FunctionEntry = { defs: (Place & { lines: number })[]; dropped: Place | null };
type TableEntry = { created: Place; altered: string[] };
type PolicyEntry = { table: string; last: Place; changes: number; dropped: boolean };
type TriggerEntry = { table: string; last: Place; dropped: boolean };
type EnumEntry = { created: Place; extended: string[] };

/** Same length, same line breaks, nothing but spaces: positions in the masked text stay true. */
function blank(text: string): string {
  return text.replace(/[^\n]/g, " ");
}

/** Line comments and block comments out, so a commented statement is never counted. */
function maskComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/--[^\n]*/g, blank);
}

/** Dollar-quoted bodies out: what a function or a DO block does inside is not a statement of the file. */
function maskBodies(sql: string): string {
  return sql.replace(/(\$[a-z_]*\$)[\s\S]*?\1/gi, blank);
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** `public.` is the default schema and is dropped; `ops.` stays a part of the name. */
function qualified(schema: string | undefined, name: string): string {
  const s = (schema ?? "").toLowerCase().replace(/\.$/, "");
  return (s && s !== "public" ? `${s}.` : "") + name.toLowerCase();
}

export type SchemaIndex = {
  files: string[];
  lines: number;
  functions: Map<string, FunctionEntry>;
  tables: Map<string, TableEntry>;
  policies: Map<string, PolicyEntry>;
  triggers: Map<string, TriggerEntry>;
  enums: Map<string, EnumEntry>;
  data: { file: string; statements: string[] }[];
};

export function readSchemaIndex(dir: string = MIGRATIONS_DIR): SchemaIndex {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const index: SchemaIndex = {
    files,
    lines: 0,
    functions: new Map(),
    tables: new Map(),
    policies: new Map(),
    triggers: new Map(),
    enums: new Map(),
    data: [],
  };

  for (const file of files) {
    const raw = readFileSync(join(dir, file), "utf8").split("\r\n").join("\n");
    index.lines += raw.split("\n").length;
    const noComments = maskComments(raw);
    const sql = maskBodies(noComments);
    const at = (i: number): Place => ({ file, line: lineAt(raw, i) });

    // statements in the order they stand in the file: a drop after a create wins, and the reverse
    type Event = { index: number; apply: () => void };
    const events: Event[] = [];
    const on = (re: RegExp, apply: (m: RegExpExecArray) => void) => {
      for (const m of sql.matchAll(re)) events.push({ index: m.index, apply: () => apply(m as RegExpExecArray) });
    };

    on(/create\s+(?:or\s+replace\s+)?function\s+((?:[a-z_]+)\.)?([a-z_0-9]+)\s*\(/gi, (m) => {
      const name = qualified(m[1], m[2]);
      // the body is masked in `sql`; its length is read from the text with comments only masked
      const rest = noComments.slice(m.index);
      const tag = rest.match(/\bas\s+(\$[a-z_]*\$)/i);
      let lines = 1;
      if (tag) {
        const start = rest.indexOf(tag[1]);
        const end = rest.indexOf(tag[1], start + tag[1].length);
        if (end > 0) lines = rest.slice(0, end).split("\n").length;
      }
      const entry = index.functions.get(name) ?? { defs: [], dropped: null };
      entry.defs.push({ ...at(m.index), lines });
      entry.dropped = null;
      index.functions.set(name, entry);
    });
    on(/drop\s+function\s+(?:if\s+exists\s+)?((?:[a-z_]+)\.)?([a-z_0-9]+)/gi, (m) => {
      const entry = index.functions.get(qualified(m[1], m[2]));
      // dropping an old signature right before the new definition is not the end of the function:
      // the create that follows in the same file clears the mark
      if (entry) entry.dropped = at(m.index);
    });

    on(/create\s+table\s+(?:if\s+not\s+exists\s+)?((?:[a-z_]+)\.)?([a-z_0-9]+)/gi, (m) => {
      const name = qualified(m[1], m[2]);
      if (!index.tables.has(name)) index.tables.set(name, { created: at(m.index), altered: [] });
    });
    on(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?((?:[a-z_]+)\.)?([a-z_0-9]+)/gi, (m) => {
      const entry = index.tables.get(qualified(m[1], m[2]));
      if (entry && entry.created.file !== file && !entry.altered.includes(file)) entry.altered.push(file);
    });

    on(/(create|alter|drop)\s+policy\s+(?:if\s+exists\s+)?"?([a-z_0-9 ]+?)"?\s+on\s+((?:[a-z_]+)\.)?([a-z_0-9]+)/gi, (m) => {
      const table = qualified(m[3], m[4]);
      const key = `${table}.${m[2].toLowerCase()}`;
      const verb = m[1].toLowerCase();
      const entry = index.policies.get(key);
      if (verb === "drop") {
        if (entry) entry.dropped = true;
        return;
      }
      if (entry) {
        entry.last = at(m.index);
        entry.changes += 1;
        entry.dropped = false;
      } else index.policies.set(key, { table, last: at(m.index), changes: 1, dropped: false });
    });

    on(/create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+([a-z_0-9]+)[\s\S]*?\bon\s+((?:[a-z_]+)\.)?([a-z_0-9]+)/gi, (m) => {
      index.triggers.set(m[1].toLowerCase(), { table: qualified(m[2], m[3]), last: at(m.index), dropped: false });
    });
    on(/drop\s+trigger\s+(?:if\s+exists\s+)?([a-z_0-9]+)/gi, (m) => {
      const entry = index.triggers.get(m[1].toLowerCase());
      if (entry) entry.dropped = true;
    });

    on(/create\s+type\s+((?:[a-z_]+)\.)?([a-z_0-9]+)\s+as\s+enum/gi, (m) => {
      const name = qualified(m[1], m[2]);
      if (!index.enums.has(name)) index.enums.set(name, { created: at(m.index), extended: [] });
    });
    on(/alter\s+type\s+((?:[a-z_]+)\.)?([a-z_0-9]+)\s+add\s+value/gi, (m) => {
      const entry = index.enums.get(qualified(m[1], m[2]));
      if (entry && !entry.extended.includes(file)) entry.extended.push(file);
    });

    events.sort((a, b) => a.index - b.index);
    for (const event of events) event.apply();

    // rows written by the migration itself, outside any function
    const statements = new Set<string>();
    for (const m of sql.matchAll(/^[ \t]*(insert\s+into\s+[a-z_.0-9"]+|update\s+[a-z_.0-9"]+|delete\s+from\s+[a-z_.0-9"]+)/gim)) {
      statements.add(m[1].replace(/\s+/g, " ").toLowerCase());
    }
    if (statements.size > 0) index.data.push({ file, statements: [...statements] });
  }
  return index;
}

const place = (p: Place) => `\`${p.file}:${p.line}\``;
const short = (file: string) => `\`${file.slice(0, 14)}\``;
const byName = <T>(map: Map<string, T>) => [...map].sort(([a], [b]) => a.localeCompare(b));

export function renderSchemaIndex(index: SchemaIndex = readSchemaIndex()): string {
  const live = byName(index.functions).filter(([, f]) => !f.dropped);
  const gone = byName(index.functions).filter(([, f]) => f.dropped);
  const definitions = [...index.functions.values()].reduce((sum, f) => sum + f.defs.length, 0);
  const superseded = [...index.functions.values()].reduce(
    (sum, f) => sum + f.defs.slice(0, f.dropped ? undefined : -1).reduce((s, d) => s + d.lines, 0),
    0,
  );
  const out: string[] = [];
  const add = (...lines: string[]) => out.push(...lines);

  add(
    "# Указатель схемы",
    "",
    "Этот файл собран скриптом из `supabase/migrations/` — руками не править. Пересобрать: `pnpm db:index`.",
    "",
    "Зачем он нужен. Схема базы — результат всех миграций по порядку. Функция при каждой правке записывается целиком заново, поэтому одно имя встречается в нескольких файлах, а действует только последнее определение. Указатель говорит, где оно лежит. Перед правкой функции открой файл из столбца «Действует» и копируй тело оттуда, а не из первого найденного поиском.",
    "",
    `Миграций — ${index.files.length}, строк — ${index.lines}. Функций — ${live.length}, их определений — ${definitions}; устаревших тел — ${superseded} строк (${Math.round((superseded / index.lines) * 100)} % текста миграций).`,
    "",
    "## Функции",
    "",
    "| Функция | Действует | Определений |",
    "|---|---|---|",
  );
  for (const [name, f] of live) add(`| \`${name}\` | ${place(f.defs[f.defs.length - 1])} | ${f.defs.length} |`);

  if (gone.length > 0) {
    add("", "Удалены и больше не существуют:", "");
    for (const [name, f] of gone) add(`- \`${name}\` — удалена в ${place(f.dropped as Place)}`);
  }

  add("", "## Таблицы", "", "| Таблица | Создана | Менялась в |", "|---|---|---|");
  for (const [name, t] of byName(index.tables)) add(`| \`${name}\` | ${place(t.created)} | ${t.altered.map(short).join(", ") || "—"} |`);

  add("", "## Политики RLS", "", "| Таблица и политика | Действует | Правок |", "|---|---|---|");
  for (const [name, p] of byName(index.policies)) if (!p.dropped) add(`| \`${name}\` | ${place(p.last)} | ${p.changes} |`);

  add("", "## Триггеры", "", "| Триггер | На таблице | Действует |", "|---|---|---|");
  for (const [name, t] of byName(index.triggers)) if (!t.dropped) add(`| \`${name}\` | \`${t.table}\` | ${place(t.last)} |`);

  add("", "## Перечисления", "", "| Тип | Создан | Значения добавлялись в |", "|---|---|---|");
  for (const [name, e] of byName(index.enums)) add(`| \`${name}\` | ${place(e.created)} | ${e.extended.map(short).join(", ") || "—"} |`);

  add(
    "",
    "## Миграции, которые пишут строки",
    "",
    "Эти миграции не только меняют схему, но и пишут данные. На пустой базе правки существующих строк ничего не делают; вставки в `storage.buckets` создают бакеты и нужны всегда.",
    "",
    "| Миграция | Что пишет |",
    "|---|---|",
  );
  for (const d of index.data) add(`| \`${d.file}\` | ${d.statements.map((s) => `\`${s}\``).join(", ")} |`);

  return out.join("\n") + "\n";
}

// run as a script: `tsx scripts/schema-index.ts`
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = renderSchemaIndex();
  writeFileSync(INDEX_PATH, text);
  console.log(`supabase/SCHEMA.md: ${text.split("\n").length} lines`);
}
