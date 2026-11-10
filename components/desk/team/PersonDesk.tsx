"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { MenuButton, type MenuItem } from "@/components/desk/ui/Menu";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import type { Tone } from "@/components/desk/ui/tone";
import { When } from "@/components/desk/ui/When";
import { usePushTest } from "@/components/push/usePushTest";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { useMinute } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { timeOf } from "@/lib/daily-report/format";
import { useTeamDailyReportDay } from "@/lib/daily-report/queries";
import { todayYmd } from "@/lib/datetime/calendar";
import { pointsTone } from "@/lib/desk/format";
import { DESK_STATUS_LABEL } from "@/lib/desk/tasks";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { assignableRoles, canChangeAccess, canEditPerson, canResetLogin, type Who } from "@/lib/people/access";
import { usePhones, useSavePhone, useSavePhoto, useSetWorking, useStanding } from "@/lib/people/card-queries";
import { useTeamLoads } from "@/lib/people/loads";
import { cleanPhone, phoneHref } from "@/lib/people/phone";
import {
  AVAILABILITY_LABEL,
  ROLE_LABEL,
  usePeople,
  usePerson,
  usePersonMessages,
  useUpdatePerson,
  type Person,
  type PersonMessage,
} from "@/lib/people/queries";
import { useTeamBalances } from "@/lib/points/queries";
import { usePushHealth } from "@/lib/push/health-query";
import { useComposeStore } from "@/lib/store/compose";
import { useMe, useSentTasks, type TaskWithPeople } from "@/lib/tasks/queries";
import { deadlineLabel, isOverdue, type TaskStatus } from "@/lib/tasks/status-text";

import { deskDraftOf, deskPatchOf } from "./draft";
import { NextWithoutLogin } from "./NextWithoutLogin";
import { CopyButton, FormRow } from "./fields";
import { dropHandover, peekHandover } from "./handoff";
import { HeroFacts, type HeroFact } from "./Hero";
import { useScreenKeys } from "./keys";
import { LoginBlock } from "./LoginBlock";
import { PeriodBlock } from "./PeriodBlock";
import { PersonEditor } from "./PersonEditor";
import { RemoveDialog, type RemoveMode } from "./RemoveDialog";
import { addressOf, AVAILABILITY_TONE, Block, Face, GridBone, LoadFailed, roleLine, StateWord, tidy } from "./shared";

const OPEN: TaskStatus[] = ["scheduled", "sent", "accepted", "in_progress", "rework"];
const CLOSED: TaskStatus[] = ["done", "declined", "revoked"];

/** A message in one line: the new state, the photo's caption or the words; empty — nothing to show. */
function messageLine(m: PersonMessage): string {
  if (m.type === "status_change") {
    const next = (m.meta as { new_status?: TaskStatus } | null)?.new_status;
    return next ? `→ ${DESK_STATUS_LABEL[next]}` : "";
  }
  if (m.type === "photo") return `Фото: ${m.content ?? "к отчёту"}`;
  return m.content?.trim() ?? "";
}

/** «Сотрудник · Снабженец · в отпуске» — the line beside the name: the role, and a state only when there is one. */
function personLine(person: Person): string {
  const state = !person.is_active ? "не в команде" : person.role !== "tv" && person.availability !== "active" ? AVAILABILITY_LABEL[person.availability].toLowerCase() : null;
  return [roleLine(person), state].filter(Boolean).join(" · ");
}

/**
 * The card's total, one line of the sheet (D-154, D-158): the photo as in a personnel file, and
 * what the director reads (`children`: the load as numbers, today's report). The spoken forms are
 * the card's, below — said once. Nothing to show — no line.
 */
function Identity({ person, children }: { person: Person; children?: ReactNode }) {
  if (!person.avatar_url && !children) return null;
  return (
    <section className="flex items-center gap-4" data-testid="desk-person-identity">
      <span className={`empty:hidden ${person.is_active ? "" : "opacity-55"}`}>
        <Face person={person} size={64} />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

/** Today's report in one line, leading to «Отчёты»: «сдан в 18:04» / «ещё не сдан». */
function TodayReport({ personId, companyId, now }: { personId: string; companyId: string | undefined; now: Date }) {
  const settings = useCompanySettings();
  const day = useTeamDailyReportDay(todayYmd(now), companyId, settings.data?.daily_report.enabled === true);
  const row = day.data?.rows.find((r) => r.user_id === personId);
  if (!row || row.state === "off") return null;
  const text =
    row.state === "submitted"
      ? `сдан в ${timeOf(row.report?.submitted_at)}`
      : row.state === "pending"
        ? "ещё не сдан"
        : row.state === "missed"
          ? "не сдан"
          : row.availability === "sick"
            ? "на больничном"
            : "в отпуске";
  return (
    <Link
      href={`/desk/reports?p=${personId}`}
      className="inline-flex items-baseline gap-1.5 text-[13px] leading-5 text-muted hover:text-text"
      data-testid="desk-person-report"
    >
      Отчёт за сегодня:
      <span className="text-text" style={row.state === "missed" ? { color: "var(--danger)" } : undefined}>
        {text}
      </span>
      <span aria-hidden>→</span>
    </Link>
  );
}

/** The director's total: how loaded as numbers that lead to the tasks, the points, today's report. */
function DirectorHero({ person, companyId, pointsOn, now }: { person: Person; companyId: string | undefined; pointsOn: boolean; now: Date }) {
  const loads = useTeamLoads();
  const balances = useTeamBalances(pointsOn);
  const load = loads.data?.[person.id];
  const works = person.is_active && person.role !== "tv";
  // a director's card shows the load only when somebody did give them a task
  const loaded = works && (person.role !== "director" || (load?.active ?? 0) > 0);
  const tasksOf = `/desk/tasks?who=${person.id}`;
  const balance = balances.data?.[person.id] ?? 0;
  const facts: HeroFact[] = [
    { key: "work", value: load ? load.active - load.review : 0, label: "в работе", href: `${tasksOf}&tab=working`, title: "Открыть в «Задачах»" },
    { key: "overdue", value: load?.overdue ?? 0, label: "просрочено", tone: "danger", href: `${tasksOf}&tab=yours`, title: "Открыть в «Задачах»" },
    { key: "review", value: load?.review ?? 0, label: "на приёмке", tone: "warn", href: `${tasksOf}&tab=yours`, title: "Открыть в «Задачах»" },
  ];
  // no points came: no figure, rather than a zero
  if (pointsOn && person.role !== "director" && !balances.isLoadingError) {
    facts.push({ key: "points", value: balance, label: "очков", tone: pointsTone(balance), href: "/desk/settings/points", title: "Очки и рейтинг" });
  }
  return (
    <Identity person={person}>
      {loaded ? (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          {loads.isLoading ? (
            <span className="skeleton block h-[44px] w-[280px] rounded-[2px] bg-surface-2" />
          ) : loads.isLoadingError ? (
            <LoadFailed what="нагрузку" onRetry={() => void loads.refetch()} />
          ) : (
            <HeroFacts facts={facts} />
          )}
          <TodayReport personId={person.id} companyId={companyId} now={now} />
        </div>
      ) : null}
    </Identity>
  );
}

/** The person's tasks from the director's own orders, and the last words they wrote in them. */
function DirectorLists({ person, meId, now }: { person: Person; meId: string; now: Date }) {
  const router = useRouter();
  const loads = useTeamLoads();
  const sent = useSentTasks(meId);
  const messages = usePersonMessages(person.id);
  const [showClosed, setShowClosed] = useState(false);
  const load = loads.data?.[person.id];
  const works = person.is_active && person.role !== "tv";
  const givable = works && person.role !== "director" && person.id !== meId;
  const loaded = works && (person.role !== "director" || (load?.active ?? 0) > 0);
  const tasks = useMemo(() => (sent.data ?? []).filter((task) => task.assignee_id === person.id), [sent.data, person.id]);
  const review = tasks.filter((t) => t.status === "pending_review");
  const open = tasks.filter((t) => OPEN.includes(t.status));
  const closed = tasks.filter((t) => CLOSED.includes(t.status));
  // what waits for the director first; the stage rings tell the rest, no group titles over the rows
  const rows = [...review, ...open, ...(showClosed ? closed : [])];
  const openTask = (id: string) => router.push(`/desk/tasks?id=${id}`);
  const shown = (messages.data ?? []).filter((m) => messageLine(m)).slice(0, 8);

  const columns: Column<TaskWithPeople>[] = [
    {
      key: "title",
      title: "Задача",
      render: (t) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <StatusGlyph status={t.status} overdue={isOverdue(t, now)} size={16} />
          <span className="truncate" title={t.title}>
            {t.title}
          </span>
        </span>
      ),
    },
    {
      key: "status",
      title: "Статус",
      width: "132px",
      // late is told by the ring and the deadline, the word stays the state's (lib/tasks/status-text)
      // a task handed to someone else is «передана» here as in «Задачи», not «отозвана» (D-128)
      render: (t) => <StateWord tone="muted">{t.status === "revoked" && t.passed_to ? "передана" : DESK_STATUS_LABEL[t.status].toLowerCase()}</StateWord>,
    },
    {
      key: "deadline",
      title: "Срок",
      width: "136px",
      sort: (a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"),
      render: (t) => {
        const label = deadlineLabel(t, now);
        const late = isOverdue(t, now);
        return (
          <When overdue={late} className={label.none ? "text-muted" : ""}>
            {label.text}
          </When>
        );
      },
    },
  ];

  return (
    <>
      {loaded || tasks.length > 0 ? (
        <Block
          title="Задачи"
          count={review.length + open.length}
          testId="desk-person-tasks"
          end={
            <>
              {closed.length > 0 ? (
                <button type="button" className="text-[12px] font-medium leading-4 text-muted hover:text-text" onClick={() => setShowClosed((v) => !v)} aria-expanded={showClosed}>
                  {showClosed ? "Скрыть закрытые" : `Закрытые · ${closed.length}`}
                </button>
              ) : null}
              {tasks.length > 0 ? (
                <Link href={`/desk/tasks?who=${person.id}`} className="text-[12px] font-medium leading-4 text-muted hover:text-text">
                  Все в «Задачах» →
                </Link>
              ) : null}
            </>
          }
        >
          {sent.isLoading ? (
            <GridBone rows={3} columns={3} />
          ) : sent.isLoadingError ? (
            <LoadFailed what="задачи" onRetry={() => void sent.refetch()} />
          ) : (
            <DataGrid
              aria-label="Задачи"
              columns={columns}
              rows={rows}
              rowKey={(t) => t.id}
              onActivate={(t) => openTask(t.id)}
              onRowClick={(t) => openTask(t.id)}
              empty={<EmptyState tone={works ? "ok" : undefined} title="Открытых задач нет" hint={givable ? "«Дать задачу» (T) — и строка поручения уже знает, кому" : undefined} />}
            />
          )}
        </Block>
      ) : null}

      <Block title="Последние сообщения" testId="desk-person-messages">
        {messages.isLoading ? (
          <SkeletonGroup>
            <Bone h={34} />
          </SkeletonGroup>
        ) : messages.isLoadingError ? (
          <LoadFailed what="сообщения" onRetry={() => void messages.refetch()} />
        ) : shown.length === 0 ? (
          <p className="text-[13px] leading-[18px] text-muted">Пока ни одного сообщения в задачах</p>
        ) : (
          <ul className="desk-list">
            {shown.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => openTask(m.task_id)}
                  className="grid min-h-[34px] w-full grid-cols-[minmax(0,3fr)_minmax(0,2fr)_auto] items-baseline gap-x-4 py-[6px] text-left hover:bg-surface-2/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
                >
                  <span className="truncate text-[14px] leading-5">{messageLine(m)}</span>
                  <span className="truncate text-[13px] leading-5 text-muted">{m.task?.title ?? "Задача"}</span>
                  <When className="shrink-0 text-[13px] leading-5 text-muted">{humanAqtobe(new Date(m.created_at), now)}</When>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </>
  );
}

/** The card read as facts — the same rows the editor turns into fields (a double click edits). */
function CardFacts({ person, phone, people, onEdit }: { person: Person; phone: string | null; people: Person[]; onEdit?: () => void }) {
  const manager = person.manager_id ? people.find((p) => p.id === person.manager_id) : null;
  // who answers to this person — the other side of «Подчиняется»
  const team = people.filter((p) => p.is_active && p.manager_id === person.id && p.id !== person.id);
  const muted = (text: string) => <span className="text-muted">{text}</span>;
  return (
    <div
      className={`desk-list ${onEdit ? "cursor-text" : ""}`}
      onDoubleClick={onEdit}
      title={onEdit ? "Двойной щелчок — изменить" : undefined}
      data-testid="desk-person-facts"
    >
      {person.role !== "tv" ? (
        <>
          <FormRow label="Должность" align="text">
            {person.position || muted("—")}
          </FormRow>
          <FormRow label="Телефон" align="text">
            {phone ? (
              <span className="-my-1 flex items-center gap-1">
                <a href={phoneHref(phone)} className="nums hover:underline" data-testid="desk-person-phone">
                  {phone}
                </a>
                <CopyButton text={() => phone} label="Скопировать телефон" done="Скопировал телефон" />
              </span>
            ) : (
              muted("—")
            )}
          </FormRow>
          <FormRow label="Как называет директор" align="text">
            {person.aliases.length ? person.aliases.join(", ") : muted("—")}
          </FormRow>
        </>
      ) : null}
      <FormRow label="Роль" align="text">
        {ROLE_LABEL[person.role]}
      </FormRow>
      {person.role !== "director" && person.role !== "tv" ? (
        <FormRow label="Подчиняется" align="text">
          {manager?.full_name ?? muted("никому")}
        </FormRow>
      ) : null}
      {team.length > 0 ? (
        <FormRow label="Подчинённые" align="text">
          <span data-testid="desk-person-team">
            {team.map((p, index) => (
              <span key={p.id}>
                {index > 0 ? ", " : null}
                <Link href={`/desk/team/${p.id}`} className="hover:underline">
                  {p.full_name}
                </Link>
              </span>
            ))}
          </span>
        </FormRow>
      ) : null}
      {person.role !== "tv" ? (
        <FormRow label="Доступность" align="text">
          {person.is_active ? <StateWord tone={AVAILABILITY_TONE[person.availability]}>{AVAILABILITY_LABEL[person.availability]}</StateWord> : muted("не в команде — вход закрыт")}
        </FormRow>
      ) : null}
    </div>
  );
}

/** Does their phone hear the work (D-114): the truth in one line and «Прислать проверку» — a real push, pressed by a person only. */
function PushBlock({ userId }: { userId: string }) {
  const health = usePushHealth();
  const test = usePushTest(userId);
  const verdict = health.data?.get(userId);
  // the red pencil for a push that failed; a phone without pushes is said in plain print
  const tone: Tone = !verdict || verdict.state === "idle" ? "muted" : verdict.state === "broken" ? "danger" : "ok";
  return (
    <Block title="Уведомления" testId="desk-person-push">
      <div className="desk-list">
        <div className="flex min-h-[44px] items-center gap-3 py-1">
          <span className="min-w-0 flex-1 text-[14px] leading-5">
            <StateWord tone={tone}>{verdict?.text ?? "…"}</StateWord>
          </span>
          <Button size="sm" variant="secondary" disabled={test.busy} onClick={() => void test.run()} data-testid="desk-push-test">
            {test.busy ? "Проверяю…" : "Прислать проверку"}
          </Button>
        </div>
        {verdict && verdict.state !== "ok" ? (
          <p className="py-2 text-[12px] leading-[17px] text-muted">
            Пока пуши не доходят, человек узнаёт о задачах, только открыв Pulse. Попросите открыть Pulse на телефоне и нажать «Включить уведомления»; на iPhone — сначала «На экран „Домой“».
          </p>
        ) : null}
        {test.verdict ? (
          <p
            className="py-2 text-[13px] leading-4"
            style={{ color: test.verdict.tone === "ok" ? "var(--ok)" : test.verdict.tone === "warn" ? "var(--danger)" : "var(--text-muted)" }}
          >
            {test.verdict.text}
          </p>
        ) : null}
      </div>
    </Block>
  );
}

function PersonBone() {
  return (
    <DeskPage>
      <SkeletonGroup>
        <Bone h={16} w={90} />
        <Bone h={30} w={260} className="mt-2" />
      </SkeletonGroup>
      <Bone h={44} w={360} />
      <div className="grid gap-10 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
        <SkeletonGroup grow>
          <Bone h={200} />
          <Bone h={200} className="mt-6" />
        </SkeletonGroup>
        <SkeletonGroup>
          <Bone h={200} />
          <Bone h={100} className="mt-6" />
        </SkeletonGroup>
      </div>
    </DeskPage>
  );
}

/**
 * The person's card on the desk (D-153, tasks/022 B.2; wave 3, D-158): «Команда ›» over the name,
 * the role beside it, the moves in the head (Дать задачу — T, Изменить — E, «⋯»). Under them the
 * total — the photo and, for the director, how loaded and today's report. On the left the card's
 * facts, which «Изменить» turns into fields in place (`?edit=1` opens it at once; Ctrl+S saves,
 * Esc cancels), the tasks and the last messages. On the right the login: the code with a large QR, the email, the password,
 * «Выйти со всех устройств» (`?login=1` — opened from the team's menu, the code's button under
 * the caret), and the pushes. The secretary gets what her phone editor gives her (D-104).
 * «⋯» holds the move that ends something — «Удалить…» (Delete), one word for everybody: the dialog
 * says whether the card is erased or the person leaves the team with their history (D-160); for a
 * person who left the head says «Вернуть в команду», «⋯» — «Удалить насовсем…». A person who left
 * has no login to manage: the login block and «Следующий без входа» are for the team.
 */
export function PersonDesk({ id }: { id: string }) {
  const { role, pointsEnabled } = useDeskScope();
  const director = role === "director";
  const me = useMe();
  const person = usePerson(id);
  const people = usePeople();
  const update = useUpdatePerson();
  const savePhoto = useSavePhoto();
  const savePhone = useSavePhone();
  const phones = usePhones();
  const phone = phones.data?.[id] ?? null;
  const setWorking = useSetWorking();
  const now = useMinute();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const editing = params.get("edit") === "1";
  const focusLogin = params.get("login") === "1";
  // a person just created here: their code (or first password) comes with them, once
  const [handed] = useState(() => peekHandover(id));
  useEffect(() => dropHandover(id), [id]);
  const [removing, setRemoving] = useState<RemoveMode | null>(null);

  const setEditing = (on: boolean) => router.replace(on ? `${pathname}?edit=1` : pathname, { scroll: false });

  // the roster carries the same row: one of the two answering is enough to know the person
  const p = person.data ?? people.data?.find((row) => row.id === id);
  const editor: Who | null = me.data ? { id: me.data.userId, role: me.data.role } : null;
  const mayEdit = Boolean(p && editor && canEditPerson(editor, p));
  // only «Передать задачи…» of a person who left waits on it: «Удалить…» is never late (D-160)
  const standing = useStanding(id, Boolean(p && !p.is_active && editor && canChangeAccess(editor, p)));
  const works = Boolean(p?.is_active && p.role !== "tv");
  const removable = Boolean(p && editor && canChangeAccess(editor, p));
  const givable = Boolean(director && p && works && p.role !== "director" && p.id !== editor?.id);
  const give = () => p && useComposeStore.getState().request("", { id: p.id, name: p.full_name, address: addressOf(p) });

  useScreenKeys(
    (event) => {
      if (event.code === "KeyE" && mayEdit && !editing) {
        setEditing(true);
        return true;
      }
      if (event.code === "KeyT" && givable) {
        give();
        return true;
      }
      if (event.code === "Delete" && removable && !editing && p) {
        setRemoving(p.is_active ? "remove" : "erase");
        return true;
      }
      return false;
    },
    Boolean(p),
  );
  useShortcuts("Карточка сотрудника", [
    ...(mayEdit ? [{ keys: ["E"], label: "Изменить карточку" }] : []),
    ...(givable ? [{ keys: ["T"], label: "Дать задачу" }] : []),
    ...(mayEdit ? [{ keys: ["Ctrl S"], label: "Сохранить изменения" }, { keys: ["Esc"], label: "Отменить (спросит, если что-то вписано)" }] : []),
    ...(removable ? [{ keys: ["Del"], label: "Удалить" }] : []),
  ]);

  // «нет такого человека» is said only when the roster says so, never because a request failed
  if (me.isLoadingError || (!p && people.isLoadingError)) {
    return (
      <DeskPage>
        <PageTitle title="Карточка" />
        <EmptyState
          title="Не смог загрузить карточку"
          hint="Проверьте связь и попробуйте ещё раз"
          action={
            <Button
              size="sm"
              variant="secondary"
              loading={people.isFetching || person.isFetching || me.isFetching}
              onClick={() => {
                void me.refetch();
                void people.refetch();
                void person.refetch();
              }}
              data-testid="desk-load-retry"
            >
              Повторить
            </Button>
          }
        />
      </DeskPage>
    );
  }
  if (person.isLoading || people.isLoading || !me.data) return <PersonBone />;
  if (!p || !editor) {
    return (
      <DeskPage>
        <PageTitle title="Сотрудник не найден" />
        <EmptyState
          title="Такого человека нет в команде"
          hint="Возможно, ссылка устарела"
          action={
            <Link href="/desk/team">
              <Button size="sm" variant="secondary">
                Открыть «Команду»
              </Button>
            </Link>
          }
        />
      </DeskPage>
    );
  }

  const access = canChangeAccess(editor, p);
  const roster = people.data ?? [];
  const manageLogin = canResetLogin(editor, p);
  const more: MenuItem[] = [];
  if (director && works) more.push({ key: "tasks", label: "Задачи человека", onSelect: () => router.push(`/desk/tasks?who=${p.id}`) });
  if (director && works) more.push({ key: "reports", label: "Отчёт за сегодня", onSelect: () => router.push(`/desk/reports?p=${p.id}`) });
  if (manageLogin && p.is_active) more.push({ key: "login", label: "Выдать код входа…", onSelect: () => router.replace(`${pathname}?login=1`, { scroll: false }) });
  const kiosk = p.role === "tv";
  const revive = () =>
    setWorking.mutate(
      { id: p.id, working: true },
      {
        onSuccess: () => toast(kiosk ? `Экран «${p.full_name}» включён` : `${p.full_name} снова в команде. Вход — по новому коду`),
        onError: (error) => toast(error.message),
      },
    );
  if (access && !p.is_active && director && (standing.data?.open.movable ?? 0) > 0) more.push({ key: "pass", label: "Передать задачи…", onSelect: () => setRemoving("pass") });
  // not from the editor: a card about to go has no draft worth a question
  if (access && !editing) {
    more.push("separator", {
      key: "remove",
      label: p.is_active ? (kiosk ? "Выключить экран…" : "Удалить…") : "Удалить насовсем…",
      hint: "Del",
      danger: true,
      onSelect: () => setRemoving(p.is_active ? "remove" : "erase"),
    });
  }

  return (
    <DeskPage>
      <div className="flex flex-col">
        <nav aria-label="Путь" className="text-[13px] leading-5">
          <Link href={`/desk/team?p=${p.id}`} className="text-muted hover:text-text" data-testid="desk-person-back">
            Команда
          </Link>
          <span aria-hidden className="px-1.5 text-muted/60">
            ›
          </span>
        </nav>
        <PageTitle
          title={p.full_name}
          state={{ text: personLine(p) }}
          actions={
            <>
              {givable ? (
                <Tooltip label="Строка поручения уже знает, кому" keys={["T"]} side="bottom">
                  {/* the fill is the screen's one: while a form or a code is open, theirs */}
                  <Button size="sm" variant={editing || focusLogin ? "secondary" : "primary"} data-testid="desk-person-give" onClick={give}>
                    Дать задачу
                  </Button>
                </Tooltip>
              ) : null}
              {access && !p.is_active ? (
                <Button size="sm" variant="secondary" loading={setWorking.isPending} onClick={revive} data-testid="desk-person-revive">
                  {kiosk ? "Включить экран" : "Вернуть в команду"}
                </Button>
              ) : null}
              {mayEdit && !editing ? (
                <Tooltip label="Изменить карточку" keys={["E"]} side="bottom">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(true)} data-testid="desk-person-edit">
                    Изменить
                  </Button>
                </Tooltip>
              ) : null}
              {more.length > 0 ? (
                <MenuButton
                  items={tidy(more)}
                  label="Ещё"
                  className="flex h-9 w-9 items-center justify-center rounded-[2px] text-[18px] leading-none text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  ⋯
                </MenuButton>
              ) : null}
            </>
          }
        />
      </div>
      {director ? <DirectorHero person={p} companyId={me.data.companyId} pointsOn={pointsEnabled} now={now} /> : <Identity person={p} />}
      {/* two columns while the screen's own width allows — the panel takes 440 px of the window */}
      <div className="@container">
        <div className="grid items-start gap-x-10 gap-y-6 @min-[920px]:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]" data-testid="desk-person">
          <div className="flex min-w-0 flex-col gap-6">
            <Block
              title="Карточка"
              testId="desk-person-card"
              end={editing ? <span className="text-[12px] leading-4 text-muted">правка</span> : null}
            >
              {!mayEdit ? (
                <>
                  <CardFacts person={p} phone={phone} people={roster} />
                  <p className="text-[12px] leading-4 text-muted">Карточку директора меняет только директор</p>
                </>
              ) : editing && phones.isPending ? null : editing ? (
                <PersonEditor
                  key={p.id}
                  mode="edit"
                  draftKey={p.id}
                  photoUrl={p.avatar_url}
                  initial={deskDraftOf(p, phone)}
                  roles={assignableRoles(editor.role, p.role)}
                  lockedRole={
                    access
                      ? undefined
                      : editor.id === p.id
                        ? "Свою роль и доступ здесь не меняют — иначе можно закрыть себе вход в настройки"
                        : "Роль директора меняет только директор"
                  }
                  managers={roster.filter((m) => m.id !== id && m.is_active && (m.role === "manager" || m.role === "director"))}
                  roster={roster.filter((m) => m.id !== id && m.is_active && m.role !== "tv")}
                  pending={update.isPending || savePhoto.isPending || savePhone.isPending}
                  onSubmit={async (draft, photo, { leaving }) => {
                    // the photo first: it is what fails, and then nothing else has been written
                    await savePhoto.mutateAsync({ id, companyId: me.data.companyId, photo });
                    await update.mutateAsync({ id, patch: deskPatchOf(draft, access) });
                    const typed = cleanPhone(draft.phone);
                    if (typed !== phone) await savePhone.mutateAsync({ id, companyId: me.data.companyId, phone: typed });
                    if (!leaving) setEditing(false);
                  }}
                  onCancel={() => setEditing(false)}
                />
              ) : (
                <CardFacts person={p} phone={phone} people={roster} onEdit={() => setEditing(true)} />
              )}
            </Block>

            {/* a person who left still has their last 30 days */}
            {director && p.role !== "director" && p.role !== "tv" ? <PeriodBlock personId={p.id} now={now} /> : null}
            {director ? <DirectorLists person={p} meId={me.data.userId} now={now} /> : null}
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            {/* a login just created is handed over even where it cannot be managed later (a new director); who left has none */}
            {p.is_active && (manageLogin || handed) ? <LoginBlock person={p} handed={handed} manage={manageLogin} focus={focusLogin} /> : null}
            {p.is_active && manageLogin ? <NextWithoutLogin personId={p.id} /> : null}
            {mayEdit && works ? <PushBlock userId={p.id} /> : null}
          </div>
        </div>
      </div>
      {removing ? (
        <RemoveDialog
          person={p}
          roster={roster}
          director={director}
          mode={removing}
          onClose={() => setRemoving(null)}
          // out of the team or erased: back to the team, the toast holds «Вернуть»
          onDone={() => router.replace("/desk/team")}
        />
      ) : null}
    </DeskPage>
  );
}
