"use client";

import { motion } from "framer-motion";
import { useState } from "react";

import { CodeLine, hang } from "./CodeLine";
import styles from "./tech.module.css";

/**
 * One database, walls between companies (D-134): the real `tasks_select` policy
 * (migrations 20260907120100, 20260926210000) run by hand over seven made-up rows of two
 * companies. Pick who is asking — every row the policy hides says which clause hid it.
 */

type Company = "A" | "B";

type Viewer = { key: string; label: string; company: Company; uid: string; director: boolean };

const VIEWERS: Viewer[] = [
  { key: "dir-a", label: "Директор A", company: "A", uid: "serik", director: true },
  { key: "emp-a", label: "Марат, сотрудник A", company: "A", uid: "marat", director: false },
  { key: "dir-b", label: "Директор B", company: "B", uid: "aliya", director: true },
];

type Row = { company: Company; assignee: string; who: string; author: string; title: string; status: keyof typeof STATUS };

const STATUS = {
  sent: "отправлена",
  accepted: "принята",
  done: "готово",
  scheduled: "отложена",
  rework: "на доработке",
} as const;

const ROWS: Row[] = [
  { company: "A", assignee: "marat", who: "Марат", author: "serik", title: "КП по объекту на Абая", status: "sent" },
  { company: "A", assignee: "aigul", who: "Айгуль", author: "serik", title: "Созвониться с банком", status: "accepted" },
  { company: "A", assignee: "erlan", who: "Ерлан", author: "serik", title: "Фотоотчёт с объекта", status: "done" },
  { company: "A", assignee: "marat", who: "Марат", author: "serik", title: "Смета по Абая", status: "scheduled" },
  { company: "B", assignee: "dana", who: "Дана", author: "aliya", title: "Отгрузка на склад", status: "sent" },
  { company: "B", assignee: "timur", who: "Тимур", author: "aliya", title: "Сверка с поставщиком", status: "accepted" },
  { company: "B", assignee: "dana", who: "Дана", author: "aliya", title: "Акт приёмки", status: "rework" },
];

const CLAUSES = [
  { lines: [1], reason: "чужая компания" },
  { lines: [2], reason: "отложена — видит автор" },
  { lines: [3, 4], reason: "не его задача" },
] as const;

const POLICY = [
  "create policy tasks_select on tasks for select using (",
  "  company_id = auth_company_id()  -- 1",
  "  and (status <> 'scheduled' or author_id = auth.uid())  -- 2",
  "  and (assignee_id = auth.uid() or author_id = auth.uid()",
  "       or auth_role() = 'director' or …)  -- 3",
  ");",
];

/** The first clause that hides the row from the viewer, or null when the row is visible. */
function hiddenBy(row: Row, viewer: Viewer): number | null {
  if (row.company !== viewer.company) return 0;
  if (row.status === "scheduled" && row.author !== viewer.uid) return 1;
  if (row.assignee !== viewer.uid && row.author !== viewer.uid && !viewer.director) return 2;
  return null;
}

const COMPANY_COLOR: Record<Company, string> = { A: "var(--accent)", B: "var(--gold)" };

export function RlsDemo() {
  const [viewerKey, setViewerKey] = useState(VIEWERS[0].key);
  const viewer = VIEWERS.find((v) => v.key === viewerKey) ?? VIEWERS[0];
  const verdicts = ROWS.map((row) => hiddenBy(row, viewer));
  const visible = verdicts.filter((v) => v === null).length;
  const hits = CLAUSES.map((_, i) => verdicts.filter((v) => v === i).length);

  return (
    <div className="card p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Кто спрашивает" className="flex flex-wrap gap-1.5">
          {VIEWERS.map((v) => {
            const on = v.key === viewer.key;
            return (
              <button
                key={v.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setViewerKey(v.key)}
                className={`flex h-9 items-center gap-2 rounded-full border px-3 text-[14px] font-medium leading-[18px] transition-colors ${
                  on ? "border-accent/50 bg-accent/15 text-text" : "border-border bg-surface-2 text-muted"
                }`}
              >
                <span aria-hidden className="size-2 rounded-full" style={{ background: COMPANY_COLOR[v.company] }} />
                {v.label}
              </button>
            );
          })}
        </div>
        <p className="nums text-[15px] leading-5 text-muted">
          видно{" "}
          <motion.span key={`${viewer.key}-${visible}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="inline-block font-display text-[22px] font-extrabold text-text">
            {visible}
          </motion.span>{" "}
          из {ROWS.length}
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
        <div>
          <p className="eyebrow mb-2 text-[11px]">select * from tasks</p>
          <ul className="rounded-[14px] border border-border">
            {ROWS.map((row, i) => {
              const clause = verdicts[i];
              return (
                <li key={i} className="flex items-center gap-3 border-t border-border px-3 py-2.5 first:border-0">
                  <span
                    aria-label={`Компания ${row.company}`}
                    className={`grid size-7 shrink-0 place-items-center rounded-[8px] font-display text-[13px] font-bold ${styles.row}`}
                    data-hidden={clause === null ? undefined : ""}
                    style={{ color: COMPANY_COLOR[row.company], background: `color-mix(in srgb, ${COMPANY_COLOR[row.company]} 14%, var(--surface-2))` }}
                  >
                    {row.company}
                  </span>
                  {/* the verdict shares the name's line, so the title keeps the full width and no row changes height */}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-[13px] leading-4">
                      <span className={`truncate text-muted ${styles.row}`} data-hidden={clause === null ? undefined : ""}>
                        {row.who}
                      </span>
                      {clause === null ? (
                        <span className="shrink-0 text-[12px] text-muted">{STATUS[row.status]}</span>
                      ) : (
                        <motion.span
                          key={`${viewer.key}-${i}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3 }}
                          className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-warn"
                        >
                          <Num n={clause + 1} />
                          {CLAUSES[clause].reason}
                        </motion.span>
                      )}
                    </span>
                    <span className={`mt-0.5 block truncate text-[15px] font-medium leading-5 ${styles.row}`} data-hidden={clause === null ? undefined : ""}>
                      {row.title}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <p className="eyebrow mb-2 text-[11px]">Правило доступа · выполняет сама база</p>
          <div className="rounded-[14px] border border-border p-3" style={{ background: "color-mix(in srgb, var(--bg) 55%, var(--surface))" }}>
            <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[18px]">
              {POLICY.map((line, i) => {
                const clause = CLAUSES.findIndex((c) => (c.lines as readonly number[]).includes(i));
                const lit = clause >= 0 && hits[clause] > 0;
                return (
                  <span
                    key={i}
                    className="-mx-3 block border-l-2 px-[10px] transition-colors duration-300"
                    style={{
                      borderColor: lit ? "var(--warn)" : "transparent",
                      background: lit ? "color-mix(in srgb, var(--warn) 9%, transparent)" : undefined,
                    }}
                  >
                    <span className="block" style={hang(line)}>
                      <CodeLine text={line} />
                    </span>
                  </span>
                );
              })}
            </pre>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {CLAUSES.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-[14px] leading-5">
                <span className="flex items-center gap-2 text-muted">
                  <Num n={i + 1} />
                  {c.reason}
                </span>
                <span className={`nums font-semibold ${hits[i] ? "text-warn" : "text-muted"}`}>{hits[i] ? `скрыто ${hits[i]}` : "—"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[15px] leading-[22px] text-muted">
            Правило проверяет сама база — на каждом запросе экрана и на каждом событии Realtime. Ошибка в коде не покажет чужого: запрос просто не
            вернёт эти строки. Так закрыты все таблицы, файлы хранилища и функции; тесты pgTAP проверяют, что компания A не видит компанию B.
          </p>
        </div>
      </div>
    </div>
  );
}

/** A clause's number, the same in the policy's comments, the legend and the hidden rows. */
function Num({ n }: { n: number }) {
  return (
    <span aria-hidden className="nums grid size-4 shrink-0 place-items-center rounded-full border border-current text-[10px] font-bold leading-none">
      {n}
    </span>
  );
}
