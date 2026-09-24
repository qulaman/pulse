"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { AwardSheet, type AwardTarget } from "@/components/rating/AwardSheet";
import { TaskCard } from "@/components/tasks/TaskCard";
import { PersonSkeleton } from "@/components/ui/PageSkeletons";
import { Bone, RowListBone, SkeletonGroup, TaskListBone } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { HeadButton } from "@/components/ui/HeadButton";
import { PageHead } from "@/components/ui/PageHead";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import {
  AVAILABILITY_LABEL,
  ROLE_LABEL,
  initialsOf,
  usePerson,
  usePersonMessages,
} from "@/lib/people/queries";
import { balanceOf, useAwardPoints, usePointHistory, usePointsEnabled } from "@/lib/points/queries";
import { useComposeStore } from "@/lib/store/compose";
import { useTvControl } from "@/lib/tv/mutations";
import { useTvState } from "@/lib/tv/queries";
import { effectiveMode } from "@/lib/tv/state";
import { useTaskActions } from "@/lib/tasks/mutations";
import { useMe, useMyTasks, type TaskWithPeople } from "@/lib/tasks/queries";
import { STATUS_LABEL, isOverdue, type TaskStatus } from "@/lib/tasks/status-text";

const OPEN: TaskStatus[] = ["scheduled", "sent", "accepted", "in_progress", "rework"];
const CLOSED: TaskStatus[] = ["done", "declined", "revoked"];

const STAT_COLOR = { danger: "var(--danger)", ok: "var(--ok)", gold: "var(--gold)" } as const;

function Stat({ value, label, tone }: { value: string | number | null; label: string; tone?: keyof typeof STAT_COLOR }) {
  return (
    <div className="rounded-[12px] bg-surface-2 px-2 py-2 text-center">
      <p
        className="nums flex h-[30px] items-center justify-center text-[22px] font-bold leading-[30px]"
        style={tone ? { color: STAT_COLOR[tone] } : undefined}
      >
        {value === null ? <Bone h={22} w={28} className="bg-border" /> : value}
      </p>
      <p className="text-[11px] leading-4 text-muted">{label}</p>
    </div>
  );
}

/**
 * A person's card for the director (FRONTEND «Пульс» п.4): who they are, how loaded,
 * every task on them with the director's own buttons, and what they last said.
 * Editing the roster entry is one tap away, not the card itself.
 */
export function PersonCard() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const person = usePerson(id);
  const tasks = useMyTasks(id);
  const messages = usePersonMessages(id);
  const actions = useTaskActions(me.data);
  const compose = useComposeStore((state) => state.request);
  const [showClosed, setShowClosed] = useState(false);
  const points = usePointHistory(id);
  const pointsEnabled = usePointsEnabled().data === true;
  const award = useAwardPoints();
  const [awardTarget, setAwardTarget] = useState<AwardTarget | null>(null);
  // пульт ТВ прямо с карточки: жест «сотрудник зашёл — я нажал — его дела на стене» (D-76 §10)
  const wall = useTvState();
  const tv = useTvControl();

  // the clock is read once per mount: a lazy initializer is allowed where render is not
  const [now] = useState(() => Date.now());
  const groups = useMemo(() => {
    const all = tasks.data ?? [];
    return {
      open: all.filter((t) => OPEN.includes(t.status)),
      review: all.filter((t) => t.status === "pending_review"),
      closed: all.filter((t) => CLOSED.includes(t.status)),
      overdue: all.filter((t) => isOverdue(t)).length,
      done30: all.filter(
        (t) => t.status === "done" && t.closed_at && now - new Date(t.closed_at).getTime() < 30 * 86_400_000,
      ).length,
    };
  }, [tasks.data, now]);

  if (person.isLoading) return <PersonSkeleton />;
  if (!person.data) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
        <PageHead back={{ href: "/people", label: "Команда" }} title="Сотрудник не найден" />
      </main>
    );
  }

  const p = person.data;
  const dative = p.aliases[0] ?? p.full_name.split(/\s+/)[0] ?? p.full_name;
  const wallRow = wall.data ?? null;
  const onWall = effectiveMode(wallRow, new Date()) === "employee" && wallRow?.employee_id === p.id;

  const renderList = (list: TaskWithPeople[]) => (
    <div className="flex flex-col gap-3">
      {list.map((task) => (
        <div key={task.id} className="card-in">
          <TaskCard task={task} variant="director" actions={actions} companyId={me.data?.companyId ?? ""} href={`/tasks/${task.id}`} />
        </div>
      ))}
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      {/* «На экран» is the head's round TV button (D-109): the diode is lit while the person is on the wall;
          the kiosk is not shown on the kiosk, a person who left — neither */}
      <PageHead
        back={{ href: "/people", label: "Команда" }}
        title={p.full_name}
        sub={p.position || undefined}
        actions={
          p.is_active && p.role !== "tv" ? (
            <HeadButton
              label={onWall ? "Убрать с экрана" : "Показать на экране"}
              icon="tv"
              live={onWall}
              disabled={tv.isPending}
              testId="person-on-wall"
              onClick={() =>
                tv.mutate(onWall ? { mode: "ether" } : { mode: "employee", employeeId: p.id }, {
                  onSuccess: () => toast(onWall ? "Убрал с экрана" : `На стене — ${dative} · 10 мин`),
                })
              }
            />
          ) : null
        }
      />

      <section className="mt-4 card p-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-[22px] font-semibold text-bg"
            style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)" }}
          >
            {initialsOf(p.full_name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="neutral" interactive={false}>{ROLE_LABEL[p.role]}</Chip>
              {p.availability !== "active" ? (
                <Chip tone="warn" interactive={false}>{AVAILABILITY_LABEL[p.availability]}</Chip>
              ) : null}
              {!p.is_active ? <Chip tone="danger" interactive={false}>Не работает</Chip> : null}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          <Stat value={tasks.isLoading ? null : groups.open.length + groups.review.length} label="в работе" />
          <Stat value={tasks.isLoading ? null : groups.overdue} label="просрочено" tone={groups.overdue > 0 ? "danger" : undefined} />
          <Stat value={tasks.isLoading ? null : groups.done30} label="закрыто за 30 дн." tone={groups.done30 > 0 ? "ok" : undefined} />
          <Stat value={points.isLoading ? null : balanceOf(points.data)} label="очков" tone="gold" />
        </div>

        {/* the main action on its own line — three buttons in a row wrap on a 375px phone */}
        <div className="mt-4 flex flex-col gap-2">
          {/* the person is known by id: the chip in the sheet, and the parser does not guess (D-84) */}
          <Button block onClick={() => compose("", { id: p.id, name: p.full_name, address: `${dative}, ` })}>
            Дать задачу
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              block
              variant="secondary"
              disabled={!pointsEnabled}
              title={pointsEnabled ? undefined : "Очки выключены в Настройках"}
              onClick={() => setAwardTarget({ user_id: p.id, display_name: p.full_name })}
            >
              Поощрить
            </Button>
            <Link href={`/people/${p.id}/edit?from=card`} className="block">
              <Button block variant="secondary">
                Изменить
              </Button>
            </Link>
          </div>
        </div>
        {!pointsEnabled ? (
          <p className="mt-2 text-[12px] leading-4 text-muted">Очки выключены — включаются в Настройках</p>
        ) : null}
        {p.aliases.length > 0 ? (
          <p className="mt-3 text-[13px] leading-4 text-muted">В речи: {p.aliases.join(", ")}</p>
        ) : null}
      </section>

      <section className="mt-6">
        <h2 className="flex items-center gap-2 text-[19px] font-semibold leading-6">
          Задачи
          {!tasks.isLoading ? (
            <span className="nums rounded-full bg-surface-2 px-2 text-[13px] leading-5 text-muted">
              {groups.open.length + groups.review.length}
            </span>
          ) : null}
        </h2>
        <div className="mt-3">
          {tasks.isLoading ? (
            <SkeletonGroup>
              <TaskListBone count={2} variant="director" />
            </SkeletonGroup>
          ) : groups.open.length + groups.review.length === 0 ? (
            <div className="flex items-center gap-3 card px-4 py-3">
              <Mascot state="calm" size={44} />
              <p className="text-[16px] leading-[22px] text-muted">Открытых задач нет. Дай задачу голосом или текстом</p>
            </div>
          ) : (
            <>
              {groups.review.length > 0 ? (
                <>
                  <p className="mb-2 text-[13px] leading-4 text-muted">На приёмке</p>
                  {renderList(groups.review)}
                </>
              ) : null}
              {groups.open.length > 0 ? (
                <>
                  <p className={`mb-2 text-[13px] leading-4 text-muted ${groups.review.length > 0 ? "mt-4" : ""}`}>В работе</p>
                  {renderList(groups.open)}
                </>
              ) : null}
            </>
          )}
        </div>

        {groups.closed.length > 0 ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowClosed((v) => !v)}
              className="text-[13px] leading-4 text-muted"
              aria-expanded={showClosed}
            >
              {showClosed ? "Скрыть закрытые" : `Закрытые · ${groups.closed.length}`}
            </button>
            {showClosed ? <div className="mt-3">{renderList(groups.closed)}</div> : null}
          </div>
        ) : null}
      </section>

      <section className="mt-6">
        <h2 className="text-[19px] font-semibold leading-6">Что писал</h2>
        <div className="mt-3">
          {messages.isLoading ? (
            <SkeletonGroup>
              <RowListBone count={2} avatar={0} />
            </SkeletonGroup>
          ) : (messages.data ?? []).length === 0 ? (
            <p className="text-[14px] leading-[18px] text-muted">Пока ни одного сообщения в задачах</p>
          ) : (
            <ul className="space-y-2">
              {(messages.data ?? []).map((m) => (
                <li key={m.id} className="card-in">
                  <Link href={`/tasks/${m.task_id}`} className="block rounded-[12px] border border-border bg-surface px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2 text-[13px] leading-4 text-muted">
                      <span className="truncate">{m.task?.title ?? "Задача"}</span>
                      <span className="nums shrink-0">{humanAqtobe(new Date(m.created_at))}</span>
                    </div>
                    <p className="mt-1 text-[16px] leading-[22px]">
                      {m.type === "status_change"
                        ? `→ ${STATUS_LABEL[(m.meta as { new_status?: TaskStatus })?.new_status ?? "sent"] ?? "статус"}`
                        : m.type === "photo"
                          ? `📷 ${m.content ?? "фото к отчёту"}`
                          : m.content}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <AwardSheet
        target={awardTarget}
        onClose={() => setAwardTarget(null)}
        pending={award.isPending}
        onSubmit={(amount, reason) => {
          if (!awardTarget) return;
          award.mutate({ userId: awardTarget.user_id, amount, reason });
          setAwardTarget(null);
        }}
      />
    </main>
  );
}
