"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { useTaskDelivery } from "@/components/tasks/DeliveryStatus";
import { Desk, useDesk } from "@/components/tasks/desk/Desk";
import { isUrgentNow, TaskHead } from "@/components/tasks/TaskChrome";
import { Trace, TraceHeading, TraceLeaf, TraceNow } from "@/components/tasks/Trace";
import { SentSkeleton } from "@/components/ui/PageSkeletons";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { queueOf } from "@/lib/tasks/desk";
import { GROUP_LABEL, groupTasks, overdueCount, TIME_BUCKETS, type GroupBy } from "@/lib/tasks/grouping";
import { usePurgeClosed, useTaskActions } from "@/lib/tasks/mutations";
import { useMe, usePulseBoard, useSentTasks, type TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue, STATUS_LABEL, type TaskStatus } from "@/lib/tasks/status-text";
import { toneOf, type Tone } from "@/lib/tasks/tone";

type Filter = "active" | "review" | "closed" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "active", label: "В работе" },
  { key: "review", label: "На приёмке" },
  { key: "closed", label: "Закрытые" },
  { key: "all", label: "Все" },
];

const GROUP_OPTIONS: { key: GroupBy; title: string; hint: string }[] = [
  { key: "deadline", title: "По сроку", hint: "Сначала то, что горит: просрочено, сегодня, завтра" },
  { key: "person", title: "По людям", hint: "Одна стопка на человека, внутри — по срочности" },
  { key: "none", title: "Без группировки", hint: "Сплошной список, новые сверху" },
];

const GROUP_KEY = "pulse.sent.group";

const ACTIVE: TaskStatus[] = ["scheduled", "sent", "accepted", "in_progress", "rework"];
const CLOSED: TaskStatus[] = ["done", "declined", "revoked"];

/** «Просрочено» and «Срочно» burn, «Сегодня» is the day itself, the rest are quiet piles. */
const HEAD_TONE: Record<string, Tone> = { overdue: "danger", urgent: "warn", review: "warn", today: "accent" };

const EMPTY: TaskWithPeople[] = [];

function matches(task: TaskWithPeople, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "review") return task.status === "pending_review";
  if (filter === "closed") return CLOSED.includes(task.status);
  return ACTIVE.includes(task.status);
}

function firstName(full: string | undefined | null): string {
  return full?.trim().split(/\s+/)[0] ?? "";
}

function SortIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden className="shrink-0">
      <path d="M4 6h12M4 10h8M4 14h4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-accent">
      <polyline points="4,10.5 8,14.5 16,5.5" />
    </svg>
  );
}

/**
 * «Задачи» as a desk (D-80): the head is a device — a display that says whose move it is
 * and holds one task, three keys for that task's commands — and the list below is the
 * trace of everything handed out, grouped the way a planner groups. A tap on a row puts
 * the task on the display; a second tap opens its thread. The director's buttons live
 * on the desk now, three at most, every one an existing action (useTaskActions).
 */
export default function SentPage() {
  const router = useRouter();
  const me = useMe();
  const tasks = useSentTasks(me.data?.userId);
  const board = usePulseBoard(me.data);
  const actions = useTaskActions(me.data);
  const [filter, setFilter] = useState<Filter>("active");
  const [purging, setPurging] = useState(false);
  const purge = usePurgeClosed();
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("deadline");
  const [grouping, setGrouping] = useState(false);
  const now = useMemo(() => new Date(), []);

  const all = tasks.data ?? EMPTY;
  const meId = me.data?.userId;
  // the board holds the whole company; the desk answers for what this director handed
  // out — only the author's reply closes a question, so only the author's tasks are «ваш ход»
  const mine = useMemo(() => (board.data ?? []).filter((task) => task.author_id === meId), [board.data, meId]);
  const boardById = useMemo(() => new Map(mine.map((task) => [task.id, task])), [mine]);
  const queue = useMemo(() => queueOf(mine, now), [mine, now]);
  const questionIds = useMemo(() => new Set(mine.filter((task) => task.question).map((task) => task.id)), [mine]);

  const loading = me.isLoading || tasks.isLoading || board.isLoading;
  const desk = useDesk({ tasks: all, queue, ready: !loading });
  const delivery = useTaskDelivery(desk.selectedId);

  // the choice is this phone's habit, not company data; read after the first paint so
  // the server pass and the client pass agree (same trick as the push row in Профиль)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(GROUP_KEY);
        if (saved === "deadline" || saved === "person" || saved === "none") setGroupBy(saved);
      } catch {
        // private mode: the default is fine
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const chooseGroup = (next: GroupBy) => {
    setGroupBy(next);
    setGrouping(false);
    try {
      window.localStorage.setItem(GROUP_KEY, next);
    } catch {
      // nothing to remember, nothing to fix
    }
  };

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter(
      (t) =>
        matches(t, filter) &&
        (!needle || t.title.toLowerCase().includes(needle) || (t.assignee?.full_name ?? "").toLowerCase().includes(needle)),
    );
  }, [all, filter, query]);

  const counts = useMemo(
    () => ({
      active: all.filter((t) => matches(t, "active")).length,
      review: all.filter((t) => matches(t, "review")).length,
      closed: all.filter((t) => matches(t, "closed")).length,
      all: all.length,
    }),
    [all],
  );

  // grouping by deadline inside «Закрытые» would be one pile called «Закрытые»
  const effectiveGroup: GroupBy = filter === "closed" && groupBy === "deadline" ? "none" : groupBy;
  const groups = useMemo(() => groupTasks(rows, effectiveGroup, now, { reviewFirst: true }), [rows, effectiveGroup, now]);

  // the tick divides «чей ход» from «когда»: it stands before the first dated pile
  const nowIndex =
    effectiveGroup === "deadline" ? groups.findIndex((group) => TIME_BUCKETS.includes(group.key as never)) : -1;

  if (loading || !me.data) return <SentSkeleton />;

  // a tap puts the task on the display; a tap on the task already there opens its thread
  const tap = (task: TaskWithPeople) => {
    if (desk.selectedId === task.id) router.push(`/tasks/${task.id}`);
    else desk.select(task.id);
  };

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-3">
      <h1 className="sr-only">Задачи</h1>

      <Desk
        me={me.data}
        tasks={all}
        board={boardById}
        queue={queue}
        selectedId={desk.selectedId}
        onSelect={desk.select}
        flash={desk.flash}
        delivery={delivery.data}
        actions={desk.wrap(actions)}
      />

      {/* a hairline, not a filled box: above a list with no boxes a solid field shouts */}
      <label className="mt-1 flex min-h-[44px] items-center gap-2 rounded-[12px] border border-border/70 px-3 transition-colors duration-[120ms] focus-within:border-accent/60">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="shrink-0 text-muted" aria-hidden>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Название или имя"
          aria-label="Поиск по задачам"
          className="min-w-0 flex-1 bg-transparent text-[16px] leading-[22px] text-text outline-none placeholder:text-muted"
        />
        {query ? (
          <button type="button" aria-label="Очистить" onClick={() => setQuery("")} className="text-[16px] text-muted">
            ×
          </button>
        ) : null}
      </label>

      {/* one row, scrolled sideways: four chips wrapped to two lines and ate the first screen */}
      <div className="no-bar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => (
          <Chip key={f.key} tone={filter === f.key ? "accent" : "neutral"} onClick={() => setFilter(f.key)}>
            {f.label} <span className="nums opacity-70">{counts[f.key]}</span>
          </Chip>
        ))}
      </div>

      <div className="mt-3 flex min-h-[36px] items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setGrouping(true)}
          className="inline-flex min-h-[36px] items-center gap-1.5 text-[13px] leading-4 text-muted"
        >
          <SortIcon />
          {GROUP_LABEL[groupBy]}
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="3.5,6 8,10.5 12.5,6" />
          </svg>
        </button>

        {/* cleanup of the closed stack: wrong and test orders go for good, in one tap */}
        {filter === "closed" && counts.closed > 0 ? (
          <Button variant="ghost" size="sm" className="!text-danger/80" onClick={() => setPurging(true)}>
            Очистить закрытые ({counts.closed})
          </Button>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <div className="mt-6 flex flex-col items-center card px-6 py-10 text-center">
          <Mascot state="calm" size={64} />
          <p className="mt-4 text-[16px] leading-[22px]">
            {query ? "Ничего не нашёл" : all.length === 0 ? "Пока ничего не отправлено" : "В этой стопке пусто"}
          </p>
          <p className="mt-1 text-[13px] leading-4 text-muted">Зажми кнопку и скажи, что нужно сделать</p>
        </div>
      ) : (
        <Trace className="mt-4">
          {groups.map((group, index) => (
            <section key={group.key}>
              {/* the tick of «сейчас»: above it the day is already behind, below it still ahead */}
              {index === nowIndex ? <TraceNow now={now} className={index === 0 ? "mt-1 mb-3" : "mt-6 mb-3"} /> : null}
              {group.title ? (
                <TraceHeading
                  title={group.title}
                  count={group.tasks.length}
                  tone={HEAD_TONE[group.key] ?? "muted"}
                  className={index === 0 || index === nowIndex ? "mt-1" : "mt-6"}
                  // per person the director needs one more number: сколько из них горит
                  extra={
                    effectiveGroup === "person" && overdueCount(group.tasks, now) > 0 ? (
                      <span className="nums shrink-0 text-[12px] leading-4" style={{ color: "var(--danger)" }}>
                        · {overdueCount(group.tasks, now)} просроч.
                      </span>
                    ) : null
                  }
                />
              ) : null}
              <div className={`flex flex-col gap-2 ${group.title ? "mt-2" : ""}`}>
                {group.tasks.map((task) => {
                  const question = questionIds.has(task.id);
                  const overdue = isOverdue(task, now);
                  const burning = overdue || isUrgentNow(task);
                  const selected = desk.selectedId === task.id;
                  const closed = CLOSED.includes(task.status);
                  return (
                    <div key={task.id} className="card-in">
                      <TraceLeaf
                        tone={overdue ? "danger" : question || isUrgentNow(task) ? "warn" : toneOf(task.status, false)}
                        hollow={task.status === "pending_review" || task.status === "scheduled"}
                        halo={burning || selected}
                      >
                        <button
                          type="button"
                          data-testid="sent-task"
                          data-status={task.status}
                          aria-pressed={selected}
                          onClick={() => tap(task)}
                          className={[
                            "-mx-2 block w-[calc(100%+1rem)] rounded-[12px] px-2 py-1.5 text-left transition-colors duration-[120ms] active:bg-surface",
                            closed ? "opacity-55" : "",
                            // the task on the display: its title takes the accent
                            selected ? "[&_h2]:text-accent" : "",
                          ].join(" ")}
                        >
                          <TaskHead
                            task={task}
                            now={now}
                            question={question}
                            showStatus={group.key !== "overdue" && group.key !== "review"}
                            person={effectiveGroup !== "person" ? firstName(task.assignee?.full_name) || "без исполнителя" : undefined}
                          />
                        </button>
                        <p className="sr-only">{STATUS_LABEL[task.status]}</p>
                      </TraceLeaf>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {effectiveGroup === "deadline" && nowIndex === -1 && groups.length > 0 ? <TraceNow now={now} className="mt-6" /> : null}
        </Trace>
      )}

      <Sheet open={grouping} onClose={() => setGrouping(false)} title="Как показать">
        <ul className="flex flex-col">
          {GROUP_OPTIONS.map((option) => (
            <li key={option.key}>
              <button
                type="button"
                onClick={() => chooseGroup(option.key)}
                className="flex min-h-[60px] w-full items-center justify-between gap-3 border-b border-border/70 py-2 text-left last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block text-[16px] leading-[22px]">{option.title}</span>
                  <span className="block text-[13px] leading-4 text-muted">{option.hint}</span>
                </span>
                {groupBy === option.key ? <CheckIcon /> : null}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={purging} onClose={() => setPurging(false)} title="Очистить закрытые">
        <p className="text-[16px] leading-[22px] text-muted">
          Удалить {counts.closed} {counts.closed === 1 ? "закрытую задачу" : counts.closed < 5 ? "закрытые задачи" : "закрытых задач"} насовсем, вместе с перепиской? Начисленные очки останутся.
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="danger"
            block
            loading={purge.isPending}
            onClick={() => {
              purge.mutate(undefined, { onSettled: () => setPurging(false) });
            }}
          >
            Удалить
          </Button>
          <Button variant="secondary" block onClick={() => setPurging(false)}>
            Не сейчас
          </Button>
        </div>
      </Sheet>
    </main>
  );
}
