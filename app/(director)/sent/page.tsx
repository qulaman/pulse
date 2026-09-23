"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { useTaskDelivery } from "@/components/tasks/DeliveryStatus";
import { Desk, useDesk } from "@/components/tasks/desk/Desk";
import { FilterKeys, type Filter } from "@/components/tasks/desk/FilterKeys";
import { Icon } from "@/components/tasks/desk/icons";
import { isUrgentNow, TaskHead } from "@/components/tasks/TaskChrome";
import { Trace, TraceHeading, TraceLeaf, TraceNow } from "@/components/tasks/Trace";
import { Button } from "@/components/ui/Button";
import { Seam, Slot, Switch } from "@/components/ui/device/Device";
import { PersonPad } from "@/components/ui/device/PersonPad";
import { SentSkeleton } from "@/components/ui/PageSkeletons";
import { Sheet } from "@/components/ui/Sheet";
import { usePeople } from "@/lib/people/queries";
import { personDots, personSummary, queueOf } from "@/lib/tasks/desk";
import { groupTasks, TIME_BUCKETS, type GroupBy } from "@/lib/tasks/grouping";
import { usePurgeClosed, useTaskActions } from "@/lib/tasks/mutations";
import { useMe, usePulseBoard, useSentTasks, type TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue, STATUS_LABEL, type TaskStatus } from "@/lib/tasks/status-text";
import { toneOf, type Tone } from "@/lib/tasks/tone";

/** This phone's habit, not company data: «Сначала срочное» on or off. */
const URGENT_KEY = "pulse.sent.urgentFirst";

const ACTIVE: TaskStatus[] = ["scheduled", "sent", "accepted", "in_progress", "rework"];
const CLOSED: TaskStatus[] = ["done", "declined", "revoked"];

/** «Просрочено» and «Срочно» burn, «Сегодня» is the day itself, the rest are quiet piles. */
const HEAD_TONE: Record<string, Tone> = { overdue: "danger", urgent: "warn", review: "warn", today: "accent" };

const EMPTY: TaskWithPeople[] = [];

function matches(task: TaskWithPeople, filter: Filter): boolean {
  if (filter === "review") return task.status === "pending_review";
  if (filter === "closed") return CLOSED.includes(task.status);
  return ACTIVE.includes(task.status);
}

function firstName(full: string | undefined | null): string {
  return full?.trim().split(/\s+/)[0] ?? "";
}

/**
 * «Задачи» as a desk (D-80): the device on top — a display that says whose move it is and
 * holds one task, three keys for that task's commands, the search slot, the filter keys,
 * the people keypad and the order switch — and the trace of everything handed out below.
 * A tap on a row puts the task on the display; a second tap opens its thread. A lit
 * person key narrows the list and the queue to that person and puts their numbers on the
 * display. The director's buttons are all existing actions (useTaskActions), three at most.
 */
export default function SentPage() {
  const router = useRouter();
  const me = useMe();
  const tasks = useSentTasks(me.data?.userId);
  const board = usePulseBoard(me.data);
  const people = usePeople();
  const actions = useTaskActions(me.data);
  const [filter, setFilter] = useState<Filter>("active");
  const [personId, setPersonId] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const purge = usePurgeClosed();
  const [query, setQuery] = useState("");
  const [urgentFirst, setUrgentFirst] = useState(true);
  const now = useMemo(() => new Date(), []);

  const all = tasks.data ?? EMPTY;
  const meId = me.data?.userId;
  // the board holds the whole company; the desk answers for what this director handed
  // out — only the author's reply closes a question, so only the author's tasks are «ваш ход»
  const mine = useMemo(() => (board.data ?? []).filter((task) => task.author_id === meId), [board.data, meId]);
  const boardById = useMemo(() => new Map(mine.map((task) => [task.id, task])), [mine]);
  const queueAll = useMemo(() => queueOf(mine, now), [mine, now]);
  const queue = useMemo(
    () => (personId ? queueAll.filter((item) => item.task.assignee_id === personId) : queueAll),
    [queueAll, personId],
  );
  const questionIds = useMemo(() => new Set(mine.filter((task) => task.question).map((task) => task.id)), [mine]);
  // the dots under the people keys speak for the whole desk, whoever is lit
  const dots = useMemo(() => personDots(queueAll, all, now), [queueAll, all, now]);

  const scoped = useMemo(() => (personId ? all.filter((task) => task.assignee_id === personId) : all), [all, personId]);
  const personName = firstName(people.data?.find((person) => person.id === personId)?.full_name);
  const personLine = useMemo(
    () => (personId ? personSummary(personName || "Без имени", scoped, now) : null),
    [personId, personName, scoped, now],
  );

  const loading = me.isLoading || tasks.isLoading || board.isLoading || people.isLoading;
  const desk = useDesk({ tasks: all, queue, ready: !loading });
  const delivery = useTaskDelivery(desk.selectedId);

  // read after the first paint so the server pass and the client pass agree (same trick
  // as the push row in Профиль); the old «Как показать» key is ignored on purpose
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(URGENT_KEY);
        if (saved === "false") setUrgentFirst(false);
      } catch {
        // private mode: the default is fine
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const chooseOrder = (next: boolean) => {
    setUrgentFirst(next);
    try {
      window.localStorage.setItem(URGENT_KEY, String(next));
    } catch {
      // nothing to remember, nothing to fix
    }
  };

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scoped.filter(
      (t) =>
        matches(t, filter) &&
        (!needle || t.title.toLowerCase().includes(needle) || (t.assignee?.full_name ?? "").toLowerCase().includes(needle)),
    );
  }, [scoped, filter, query]);

  const counts = useMemo(
    () => ({
      active: scoped.filter((t) => matches(t, "active")).length,
      review: scoped.filter((t) => matches(t, "review")).length,
      closed: scoped.filter((t) => matches(t, "closed")).length,
    }),
    [scoped],
  );

  // «Закрытые» by urgency would be one pile called «Закрытые»
  const groupBy: GroupBy = urgentFirst && filter !== "closed" ? "deadline" : "none";
  const groups = useMemo(() => groupTasks(rows, groupBy, now, { reviewFirst: true }), [rows, groupBy, now]);

  // the tick divides «чей ход» from «когда»: it stands before the first dated pile
  const nowIndex = groupBy === "deadline" ? groups.findIndex((group) => TIME_BUCKETS.includes(group.key as never)) : -1;

  if (loading || !me.data) return <SentSkeleton />;

  // a tap puts the task on the display; a tap on the task already there opens its thread
  const tap = (task: TaskWithPeople) => {
    if (desk.selectedId === task.id) router.push(`/tasks/${task.id}`);
    else desk.select(task.id);
  };

  // a person key is a filter: lit narrows the list to them, a second tap lets go; the
  // display drops its task so their numbers can speak
  const pickPerson = (id: string) => {
    setPersonId((current) => (current === id ? null : id));
    desk.select(null);
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
        person={personLine}
      >
        <div className="mt-3">
          <Slot>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Название или имя"
              aria-label="Поиск по задачам"
            />
            {query ? (
              <button type="button" aria-label="Очистить" onClick={() => setQuery("")} className="text-[18px] leading-none text-muted">
                ×
              </button>
            ) : null}
          </Slot>
        </div>

        <FilterKeys value={filter} counts={counts} onChange={setFilter} />

        <Seam label="Чьи дела" />
        <div className="mt-2">
          <PersonPad
            people={people.data ?? []}
            activeId={personId}
            groupLabel="Чьи дела"
            ariaFor={(person, active) => (active ? `${person.full_name} — снять фильтр` : `Дела: ${person.full_name}`)}
            onPick={(person) => pickPerson(person.id)}
            searchable={false}
            query={query}
            dotFor={(person) => dots.get(person.id) ?? null}
          />
        </div>

        <div className="mt-3">
          <Switch
            on={urgentFirst}
            icon={<Icon name="flame" size={20} />}
            title="Сначала срочное"
            value={urgentFirst ? "просрочено → приёмка → сегодня → …" : "по времени выдачи, новые сверху"}
            onToggle={chooseOrder}
          />
        </div>
      </Desk>

      {/* cleanup of the closed stack: wrong and test orders go for good, in one tap; it is
          company-wide, so not under a lit person key, where the count would be theirs */}
      {filter === "closed" && !personId && counts.closed > 0 ? (
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" size="sm" className="!text-danger/80" onClick={() => setPurging(true)}>
            Очистить закрытые ({counts.closed})
          </Button>
        </div>
      ) : null}

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
                            // a lit person key already names who
                            person={personId ? undefined : firstName(task.assignee?.full_name) || "без исполнителя"}
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
          {groupBy === "deadline" && nowIndex === -1 && groups.length > 0 ? <TraceNow now={now} className="mt-6" /> : null}
        </Trace>
      )}

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
