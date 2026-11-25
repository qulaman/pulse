"use client";

import { Bell, CalendarClock, Undo2 } from "lucide-react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { SearchField, SegmentTabs, Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import { ARCHIVE_STATUSES, type DayRange } from "@/lib/desk/archive";
import { DUE_FILTERS, DUE_LABEL, parseDue, parseStatus, STATUS_FILTERS, statusFilterLabel, type BulkPlan, type DueFilter, type LoadState, type StatusFilter } from "@/lib/desk/tasks";
import { shortName } from "@/lib/people/names";
import { DIRECTOR_TAB_LABEL, type DirectorTab } from "@/lib/tasks/overview";
import { pluralRu } from "@/lib/tasks/status-text";

import { DateRangeField } from "./DateRange";
import { LoadFailure } from "./LoadState";
import { DESK_NEW_TASK } from "./MomentBar";

/*
 * The parts around the table of «Задачи» (D-154): its tool bar, the walk's hint under it, the bar
 * of the marked rows, what an empty table says and the question before the archive is cleared.
 * Every change of the address is the screen's own (`TasksScreen`): these only say what was asked.
 */

export type PersonOption = { id: string; name: string; open: number };

/** The tabs, the groups, the person, the status, the deadline (or the days of the archive) and the search. */
export function TasksToolbar({
  tab,
  onTab,
  counts,
  group,
  choices,
  onGroup,
  who,
  people,
  onWho,
  archiveTab,
  status,
  onStatus,
  range,
  onRange,
  due,
  onDue,
  now,
  query,
  onQuery,
  tight,
  onPurge,
}: {
  tab: DirectorTab;
  onTab: (tab: DirectorTab) => void;
  counts: Record<DirectorTab, number>;
  group: string;
  choices: readonly { value: string; label: string }[];
  onGroup: (value: string) => void;
  who: string | null;
  people: readonly PersonOption[];
  onWho: (id: string | null) => void;
  archiveTab: boolean;
  /** the status filter in force on this tab */
  status: StatusFilter | null;
  onStatus: (value: StatusFilter | null) => void;
  range: DayRange | null;
  onRange: (value: DayRange | null) => void;
  due: DueFilter | null;
  onDue: (value: DueFilter | null) => void;
  now: Date;
  query: string;
  onQuery: (value: string) => void;
  /** the table is narrow: the person's list and the search give up their spare width */
  tight: boolean;
  /** «Очистить закрытые», when it may be offered */
  onPurge: (() => void) | null;
}) {
  return (
    <Toolbar
      end={
        onPurge ? (
          <Button size="sm" variant="ghost" className="!min-h-8 !px-2" onClick={onPurge} data-testid="desk-purge">
            Очистить закрытые
          </Button>
        ) : undefined
      }
    >
      <SegmentTabs<DirectorTab>
        aria-label="Задачи"
        value={tab}
        onChange={onTab}
        items={[
          // the tabs' names are the phone's (lib/tasks/overview.ts): «У команды» holds the untaken too
          { value: "yours", label: DIRECTOR_TAB_LABEL.yours, count: counts.yours },
          { value: "working", label: DIRECTOR_TAB_LABEL.working, count: counts.working },
          { value: "closed", label: DIRECTOR_TAB_LABEL.closed, count: counts.closed },
        ]}
      />
      <Select aria-label="Группы" value={group} onChange={(event) => onGroup(event.target.value)} className="w-[140px]" data-testid="desk-group">
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </Select>
      <Select aria-label="Человек" value={who ?? ""} onChange={(event) => onWho(event.target.value || null)} className={tight ? "w-[116px]" : "w-[140px]"}>
        <option value="">Все люди</option>
        {people.map((option) => (
          <option key={option.id} value={option.id}>
            {shortName(option.name)}
            {option.open > 0 ? ` · ${option.open}` : ""}
          </option>
        ))}
      </Select>
      <Select aria-label="Стадия" value={status ?? ""} onChange={(event) => onStatus(parseStatus(event.target.value))} className="w-[148px]">
        <option value="">Любая стадия</option>
        {(archiveTab ? ARCHIVE_STATUSES : STATUS_FILTERS).map((value) => (
          <option key={value} value={value}>
            {statusFilterLabel(value)}
          </option>
        ))}
      </Select>
      {archiveTab ? (
        <DateRangeField value={range} onChange={onRange} now={now} />
      ) : (
        <Select aria-label="Срок" value={due ?? ""} onChange={(event) => onDue(parseDue(event.target.value))} className="w-[136px]">
          <option value="">Любой срок</option>
          {DUE_FILTERS.map((value) => (
            <option key={value} value={value}>
              {DUE_LABEL[value]}
            </option>
          ))}
        </Select>
      )}
      <SearchField value={query} onChange={onQuery} placeholder={tight ? "Поиск" : "Поиск по задачам"} width={tight ? 128 : 176} />
    </Toolbar>
  );
}

/**
 * The marked rows' bar: it stands at the screen's foot while the table scrolls — a reminder, one
 * new deadline, a recall, each for the rows it applies to (principle 3: no «Принять» here).
 */
export function BulkBar({
  count,
  plan,
  onNudge,
  onExtend,
  onRevoke,
  onClear,
}: {
  count: number;
  plan: BulkPlan<unknown>;
  onNudge: () => void;
  onExtend: () => void;
  onRevoke: () => void;
  onClear: () => void;
}) {
  return (
    <div className="sticky bottom-4 z-20 flex justify-center" data-testid="desk-bulk-bar">
      <div className="tasks-bulk flex items-center gap-1 rounded-[2px] border border-text bg-surface px-2 py-1">
        <span className="tasks-bulk-count nums px-2 text-[13px] leading-4">
          {/* the figure is keyed: a new count arrives instead of changing in place */}
          <b key={count} className="tasks-bulk-n font-[inherit]">
            {count}
          </b>{" "}
          {pluralRu(count, ["отмечена", "отмечены", "отмечено"])}
        </span>
        <span aria-hidden className="tasks-bulk-rule h-5 w-px bg-border" />
        <Tooltip label="Тем, кому не напоминали последние полчаса">
          <Button size="sm" variant="ghost" className="!min-h-8 !px-2.5 !text-text" disabled={plan.nudge.length === 0} onClick={onNudge} data-bulk="nudge">
            <Bell aria-hidden size={14} strokeWidth={2} className="tasks-ico" />
            Напомнить <span className="nums text-muted">{plan.nudge.length}</span>
          </Button>
        </Tooltip>
        <Tooltip label="Один новый срок всем, кто в работе">
          <Button size="sm" variant="ghost" className="!min-h-8 !px-2.5 !text-text" disabled={plan.extend.length === 0} onClick={onExtend} data-bulk="extend">
            <CalendarClock aria-hidden size={14} strokeWidth={2} className="tasks-ico" />
            Перенести срок <span className="nums text-muted">{plan.extend.length}</span>
          </Button>
        </Tooltip>
        <Button size="sm" variant="ghost" className="!min-h-8 !px-2.5 !text-danger" disabled={plan.revoke.length === 0} onClick={onRevoke} data-bulk="revoke">
          <Undo2 aria-hidden size={14} strokeWidth={2} className="tasks-ico" />
          Отозвать <span className="nums opacity-70">{plan.revoke.length}</span>
        </Button>
        <span aria-hidden className="tasks-bulk-rule h-5 w-px bg-border" />
        <Button size="sm" variant="ghost" className="!min-h-8 !px-2.5" onClick={onClear} data-testid="desk-bulk-clear">
          Снять <Kbd>Esc</Kbd>
        </Button>
      </div>
    </div>
  );
}

/**
 * What an empty table says, in this order: still looking (no verdict while the answer is on its
 * way), the archive did not answer, nothing was ever sent, the filters left nothing, the board did
 * not load (no green «nothing waits» then), and each tab's own good kind of empty.
 */
export function TasksEmpty({
  tab,
  looking,
  query,
  archiveLoad,
  archiveBusy,
  onArchiveRetry,
  nothingSent,
  filtered,
  range,
  onReset,
  boardDown,
  working,
  onWorking,
  attention = null,
}: {
  tab: DirectorTab;
  looking: boolean;
  query: string;
  /** the archive's own load, on its tab; null elsewhere */
  archiveLoad: LoadState | null;
  archiveBusy: boolean;
  onArchiveRetry: () => void;
  nothingSent: boolean;
  filtered: boolean;
  range: DayRange | null;
  onReset: () => void;
  boardDown: boolean;
  /** what is in work: «Ждут вас» empty offers it */
  working: number;
  onWorking: () => void;
  /** the verdict's words while something needs the director (lib/tasks/attention.ts); null — all is well */
  attention?: string | null;
}) {
  const archiveTab = tab === "closed";
  const words = query.trim();
  if (looking) return <EmptyState title={words ? `Ищу «${words}»…` : "Загружаю закрытые задачи…"} />;
  if (archiveLoad?.kind === "failed") return <LoadFailure what="закрытые задачи" offline={archiveLoad.offline} busy={archiveBusy} onRetry={onArchiveRetry} />;
  if (nothingSent) return <EmptyState title="Пока ничего не отправлено" hint="Новая задача — строкой поручения сверху (Ctrl K) или голосом с телефона" />;
  if (filtered) {
    return (
      <EmptyState
        title={words ? `Ничего не нашёл по «${words}»` : archiveTab && range ? "За этот период ничего не закрыто" : "Под эти фильтры ничего не подходит"}
        action={
          <Button size="sm" variant="secondary" onClick={onReset}>
            Сбросить фильтры
          </Button>
        }
      />
    );
  }
  // the statuses are known, the questions and the requests for time are not: no green here
  if (tab === "yours" && boardDown) return <EmptyState title="Вопросы и просьбы о сроке не загрузились" hint="Приёмки, отказов и просрочек нет, остальное станет видно после загрузки" />;
  // nothing to decide, yet an order lies untaken or a push does not reach: say that, not «ничего не ждёт» (D-194)
  if (tab === "yours" && attention) {
    return (
      <EmptyState
        title={attention}
        hint={`Решений здесь нет — задача в «${DIRECTOR_TAB_LABEL.working}»`}
        action={
          working > 0 ? (
            <Button size="sm" variant="secondary" onClick={onWorking}>
              {DIRECTOR_TAB_LABEL.working} · {working}
            </Button>
          ) : undefined
        }
      />
    );
  }
  if (tab === "yours") {
    return (
      <EmptyState
        tone="ok"
        title="Ваших решений ничего не ждёт"
        hint="Сданная работа, вопросы, отказы и просрочки появятся здесь"
        action={
          working > 0 ? (
            <Button size="sm" variant="secondary" onClick={onWorking}>
              {DIRECTOR_TAB_LABEL.working} · {working}
            </Button>
          ) : undefined
        }
      />
    );
  }
  if (tab === "working") return <EmptyState title="У команды нет открытых задач" hint={DESK_NEW_TASK} />;
  return <EmptyState title="Закрытых пока нет" hint="Принятые и отозванные лягут сюда по дням" />;
}

/** «Очистить закрытые»: all of history, with its threads; the points stay. */
export function PurgeDialog({ open, count, busy, onClose, onConfirm }: { open: boolean; count: number; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Очистить закрытые" width="sm">
      <p className="text-[14px] leading-5 text-muted">
        Удалить {count} {pluralRu(count, ["закрытую задачу", "закрытые задачи", "закрытых задач"])} насовсем, вместе с перепиской? Отказы тоже уйдут.
        Начисленные очки останутся.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onClose}>
          Не сейчас
        </Button>
        <Button size="sm" variant="danger" loading={busy} onClick={onConfirm}>
          Удалить
        </Button>
      </div>
    </Dialog>
  );
}
