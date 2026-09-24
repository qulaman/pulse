"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { Icon } from "@/components/tasks/desk/icons";
import { Button } from "@/components/ui/Button";
import { HeadButton } from "@/components/ui/HeadButton";
import { PageHead } from "@/components/ui/PageHead";
import { Sheet } from "@/components/ui/Sheet";
import type { BoardTask } from "@/lib/pulse/board";
import type { DeskReason } from "@/lib/tasks/desk";
import type { TaskActions } from "@/lib/tasks/mutations";
import {
  closedSections,
  directorScreen,
  directorTabOf,
  matchesQuery,
  peopleLoad,
  reasonFor,
  workingSections,
  yoursSections,
  type DirectorTab,
  type Section,
} from "@/lib/tasks/overview";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";

import { DirectorTaskCard } from "./DirectorTaskCard";
import { PeopleStrip } from "./PeopleStrip";
import { StatusScreen } from "./StatusScreen";
import { Tabs } from "./Tabs";
import { TaskColumn, useAccordion, useRevealOpen } from "./TaskList";
import { useDirectorControls } from "./useDirectorControls";

const DATE_LINE = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Aqtobe" });

/**
 * «Задачи» директора (D-83): a status screen on top — whose move it is, how the open work
 * splits, the nearest deadline — then the people who hold the work, then three tabs
 * «Ждут вас / В работе / Закрытые», and the tasks as cards that open in place with their
 * buttons. The tab that asks for a move opens its first card by itself, and when that
 * move is made the next card takes its place — the director clears the pile without
 * leaving the list (principle 1). All actions are the existing ones (`useTaskActions`).
 */
export function DirectorTasksView({
  meId,
  companyId,
  tasks: all,
  board,
  actions: base,
  now,
  onPurge,
  purging: purgePending = false,
}: {
  meId: string;
  companyId: string;
  /** Everything this director handed out (`useSentTasks`). */
  tasks: readonly TaskWithPeople[];
  /** The live board (`usePulseBoard`): questions, refusal reasons, last words, read cursors. */
  board: readonly BoardTask[];
  actions: TaskActions;
  now: Date;
  onPurge: (done: () => void) => void;
  purging?: boolean;
}) {
  const [personId, setPersonId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [purgeAsk, setPurgeAsk] = useState(false);
  const searchField = useRef<HTMLInputElement>(null);

  // the board holds the company; only this director's tasks — only the author's answer closes a question
  const rows = useMemo(() => {
    const map = new Map<string, BoardTask>();
    for (const row of board) if (row.author_id === meId) map.set(row.id, row);
    return map;
  }, [board, meId]);

  const reasons = useMemo(() => {
    const map = new Map<string, DeskReason>();
    for (const task of all) {
      const reason = reasonFor(task, rows.get(task.id)?.question, now);
      if (reason) map.set(task.id, reason);
    }
    return map;
  }, [all, rows, now]);

  const people = useMemo(() => peopleLoad(all, reasons), [all, reasons]);
  const scoped = useMemo(() => (personId ? all.filter((task) => task.assignee_id === personId) : all), [all, personId]);
  const screen = useMemo(() => directorScreen(scoped, reasons, now), [scoped, reasons, now]);
  const found = useMemo(() => scoped.filter((task) => matchesQuery(task, query)), [scoped, query]);

  const piles = useMemo(() => {
    const byTab: Record<DirectorTab, TaskWithPeople[]> = { yours: [], working: [], closed: [] };
    for (const task of found) byTab[directorTabOf(task, reasons.get(task.id) ?? null)].push(task);
    return byTab;
  }, [found, reasons]);

  // the first look opens where the director's move is; after that the tab is theirs
  const [tab, setTab] = useState<DirectorTab>(() => (piles.yours.length > 0 ? "yours" : "working"));
  const current = tab;

  const sections: Section<TaskWithPeople>[] = useMemo(() => {
    if (current === "yours") {
      return yoursSections(piles.yours.map((task) => ({ task, reason: reasons.get(task.id) as DeskReason })));
    }
    if (current === "working") return workingSections(piles.working, now, { reviewTitle: "На приёмке" });
    return closedSections(piles.closed, now);
  }, [current, piles, reasons, now]);

  const ids = useMemo(() => sections.flatMap((section) => section.tasks.map((task) => task.id)), [sections]);
  const accordion = useAccordion(ids, {
    scope: `${current}|${personId ?? ""}|${query.trim()}`,
    autoOpen: current === "yours" && !query.trim(),
  });
  useRevealOpen(accordion.openId, accordion.userTouched);

  useEffect(() => {
    if (searchOpen) searchField.current?.focus({ preventScroll: true });
  }, [searchOpen]);

  const byId = (id: string) => all.find((task) => task.id === id) ?? null;
  const controls = useDirectorControls({
    base,
    companyId,
    tasks: all,
    questionOf: (id) => rows.get(id)?.question ?? null,
    now,
  });
  const { press, answer } = controls;

  const showNearest = (id: string) => {
    const task = byId(id);
    if (!task) return;
    const target = directorTabOf(task, reasons.get(id) ?? null);
    setQuery("");
    if (personId && task.assignee_id !== personId) setPersonId(null);
    setTab(target);
    accordion.focus(id);
  };

  const person = personId ? people.find((p) => p.id === personId) : undefined;
  const closedCount = all.filter((task) => task.status === "done" || task.status === "revoked" || task.status === "declined").length;

  const empty = (
    <EmptyState
      tab={current}
      query={query}
      nothingAtAll={all.length === 0}
      working={piles.working.length}
      onWorking={() => setTab("working")}
    />
  );

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead
        eyebrow={DATE_LINE.format(now)}
        title="Задачи"
        actions={
          <HeadButton
            label={searchOpen ? "Закрыть поиск" : "Поиск по задачам"}
            icon={searchOpen ? "close" : "search"}
            pressed={searchOpen}
            onClick={() => {
              if (searchOpen) setQuery("");
              setSearchOpen((open) => !open);
            }}
          />
        }
      />

      <div className="mt-3">
        <StatusScreen screen={screen} now={now} title={person ? person.name : undefined} onNearest={showNearest} />
      </div>

      <PeopleStrip people={people} value={personId} onChange={setPersonId} />

      <Tabs
        className="mt-2"
        id="sent"
        value={current}
        onChange={(next) => setTab(next)}
        items={[
          { key: "yours", label: "Ждут вас", count: piles.yours.length, alert: screen.tone === "danger" ? "danger" : "warn" },
          { key: "working", label: "В работе", count: piles.working.length },
          { key: "closed", label: "Закрытые", count: piles.closed.length },
        ]}
      >
        {searchOpen ? (
          <div className="mt-2 flex items-center gap-2 field px-3">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden className="shrink-0 text-muted">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={searchField}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Название, описание или имя"
              aria-label="Поиск по задачам"
              className="min-h-[42px] min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
            />
            {query ? (
              <button type="button" aria-label="Очистить" onClick={() => setQuery("")} className="text-[20px] leading-none text-muted">
                ×
              </button>
            ) : null}
          </div>
        ) : null}
      </Tabs>

      <div key={`${current}|${personId ?? ""}`} className="card-in mt-1">
        <TaskColumn
          sections={sections}
          empty={empty}
          renderCard={(task) => (
            <DirectorTaskCard
              task={task}
              row={rows.get(task.id)}
              reason={reasons.get(task.id) ?? null}
              meId={meId}
              open={accordion.openId === task.id}
              now={now}
              showPerson={!personId}
              onToggle={() => accordion.toggle(task.id)}
              onAction={press}
              onAnswer={answer}
              onMore={controls.more}
            />
          )}
        />
      </div>

      {/* cleanup of history: wrong and test orders go for good, company-wide — so not under a person */}
      {current === "closed" && !personId && closedCount > 0 ? (
        <div className="mt-5 flex justify-center">
          <Button variant="ghost" size="sm" className="!text-danger/80" onClick={() => setPurgeAsk(true)}>
            Очистить закрытые ({closedCount})
          </Button>
        </div>
      ) : null}

      {controls.sheets}

      <Sheet open={purgeAsk} onClose={() => setPurgeAsk(false)} title="Очистить закрытые">
        <p className="text-[16px] leading-[22px] text-muted">
          Удалить {closedCount} {pluralRu(closedCount, ["закрытую задачу", "закрытые задачи", "закрытых задач"])} насовсем, вместе с перепиской? Отказы
          тоже уйдут. Начисленные очки останутся.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="danger" block loading={purgePending} onClick={() => onPurge(() => setPurgeAsk(false))}>
            Удалить
          </Button>
          <Button variant="secondary" block onClick={() => setPurgeAsk(false)}>
            Не сейчас
          </Button>
        </div>
      </Sheet>
    </main>
  );
}

function EmptyState({
  tab,
  query,
  nothingAtAll,
  working,
  onWorking,
}: {
  tab: DirectorTab;
  query: string;
  nothingAtAll: boolean;
  working: number;
  onWorking: () => void;
}) {
  if (nothingAtAll) {
    return (
      <div className="mt-3 flex flex-col items-center rounded-[20px] border border-border/70 px-6 py-10 text-center">
        <Mascot state="calm" size={64} />
        <p className="mt-4 font-display text-[17px] font-semibold">Пока ничего не отправлено</p>
        <p className="mt-1 text-[14px] leading-[19px] text-muted">Задача — голосом: зажмите маскота на Пульсе и скажите, что сделать</p>
      </div>
    );
  }
  if (query.trim()) {
    return (
      <p className="mt-3 rounded-[20px] border border-border/70 px-6 py-8 text-center text-[15px] text-muted">
        Ничего не нашёл по «{query.trim()}»
      </p>
    );
  }
  if (tab === "yours") {
    return (
      <div className="mt-3 flex flex-col items-center rounded-[20px] border border-border/70 px-6 py-9 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ok/15 text-ok">
          <Icon name="check" size={24} />
        </span>
        <p className="mt-3 font-display text-[17px] font-semibold">Ваших решений ничего не ждёт</p>
        <p className="mt-1 text-[14px] leading-[19px] text-muted">Приёмка, вопросы, отказы и просрочки появятся здесь</p>
        {working > 0 ? (
          <Button variant="secondary" size="sm" className="mt-4" onClick={onWorking}>
            Что в работе · {working}
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <p className="mt-3 rounded-[20px] border border-border/70 px-6 py-8 text-center text-[15px] text-muted">
      {tab === "working" ? "У команды нет открытых задач" : "Закрытых пока нет"}
    </p>
  );
}
