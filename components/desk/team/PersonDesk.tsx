"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DataGrid, type Column, type Group } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { DeskLight } from "@/components/desk/ui/Light";
import { MenuButton, type MenuItem } from "@/components/desk/ui/Menu";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { Avatar } from "@/components/desk/ui/PersonCell";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { draftOf, patchOf } from "@/components/people/PersonForm";
import { usePushTest } from "@/components/push/usePushTest";
import { useMinute } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { timeOf } from "@/lib/daily-report/format";
import { useTeamDailyReportDay } from "@/lib/daily-report/queries";
import { todayYmd } from "@/lib/datetime/calendar";
import { pointsTone } from "@/lib/desk/format";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { assignableRoles, canChangeAccess, canEditPerson, canResetLogin, type Who } from "@/lib/people/access";
import { loadColor, useTeamLoads } from "@/lib/people/loads";
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
import { SHORT_STATUS, STATUS_LABEL, deadlineLabel, isOverdue, type TaskStatus } from "@/lib/tasks/status-text";
import { toneOf } from "@/lib/tasks/tone";

import { FormRow } from "./fields";
import { dropHandover, peekHandover } from "./handoff";
import { HeroFacts, type HeroFact } from "./Hero";
import { useScreenKeys } from "./keys";
import { LoginBlock } from "./LoginBlock";
import { PersonEditor } from "./PersonEditor";
import { addressOf, AVAILABILITY_TONE, Block, Dot, GridBone, LOAD_TONE, RING_TONE, roleLine } from "./shared";

const OPEN: TaskStatus[] = ["scheduled", "sent", "accepted", "in_progress", "rework"];
const CLOSED: TaskStatus[] = ["done", "declined", "revoked"];

/** The light of the card in the tone of the person's load (D-154): late — red, a deadline close — amber, on time — green. */
function LoadLight({ person, now }: { person: Person; now: Date }) {
  const loads = useTeamLoads();
  if (loads.isLoading) return null;
  return <DeskLight tone={LOAD_TONE[loadColor(loads.data?.[person.id], person.availability === "active", now.getTime())]} />;
}

/** A message in one line: the new state, the photo's caption or the words; empty — nothing to show. */
function messageLine(m: PersonMessage): string {
  if (m.type === "status_change") {
    const next = (m.meta as { new_status?: TaskStatus } | null)?.new_status;
    return next ? `→ ${STATUS_LABEL[next]}` : "";
  }
  if (m.type === "photo") return `📷 ${m.content ?? "фото к отчёту"}`;
  return m.content?.trim() ?? "";
}

/**
 * Who the person is — the card's hero, raised over the flat planes (D-154): the circle with the
 * ring of their load, the role and the position, a state only when there is one; under it what
 * the director reads (`children`: the load as numbers, today's report). The spoken forms are the
 * card's, below — said once.
 */
function Identity({ person, ring, children }: { person: Person; ring?: Tone | null; children?: ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 px-5 py-4" style={{ boxShadow: "var(--shadow-raised)" }} data-testid="desk-person-identity">
      <div className="flex items-center gap-4">
        <span className={person.is_active ? "" : "opacity-55"}>
          <Avatar name={person.full_name} ring={ring} size={56} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-display text-[17px] font-semibold leading-[22px] tracking-[-0.01em]">{roleLine(person)}</p>
            {person.is_active && person.role !== "tv" && person.availability !== "active" ? (
              <Chip tone="warn" interactive={false}>
                {AVAILABILITY_LABEL[person.availability]}
              </Chip>
            ) : null}
            {!person.is_active ? (
              <Chip tone="danger" interactive={false}>
                Не работает
              </Chip>
            ) : null}
          </div>
        </div>
      </div>
      {children}
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
      className="inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[13px] leading-4 text-muted transition-colors duration-[120ms] hover:bg-surface-2/70 hover:text-text"
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

/** The director's hero: who, how loaded as numbers that lead to the tasks, the points, today's report. */
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
  if (pointsOn && person.role !== "director") {
    facts.push({ key: "points", value: balance, label: "очков", tone: pointsTone(balance), href: "/desk/settings/points", title: "Очки и рейтинг" });
  }
  return (
    <Identity person={person} ring={loaded ? RING_TONE[loadColor(load, person.availability === "active", now.getTime())] : null}>
      {loaded ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          {loads.isLoading ? <span className="skeleton block h-[52px] w-[280px] rounded-[10px] bg-surface-2" /> : <HeroFacts facts={facts} className="-ml-3" />}
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
  const groups: Group<TaskWithPeople>[] = [
    { key: "review", title: "На приёмке", tone: "warn", rows: review },
    { key: "open", title: "В работе", tone: "ok", rows: open },
    ...(showClosed ? [{ key: "closed", title: "Закрытые", tone: "muted" as const, rows: closed }] : []),
  ];
  const openTask = (id: string) => router.push(`/desk/tasks?id=${id}`);
  const shown = (messages.data ?? []).filter((m) => messageLine(m)).slice(0, 8);

  const columns: Column<TaskWithPeople>[] = [
    { key: "title", title: "Задача", render: (t) => <span className="block truncate" title={t.title}>{t.title}</span> },
    {
      key: "status",
      title: "Статус",
      width: "132px",
      // late is told by the colour, the word stays the state's (lib/tasks/status-text)
      render: (t) => <Dot tone={toneOf(t.status, isOverdue(t, now))}>{SHORT_STATUS[t.status]}</Dot>,
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
          <span className="nums" style={{ color: label.none ? "var(--text-muted)" : late ? TONE_VAR.danger : undefined }}>
            {label.text}
          </span>
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
          ) : (
            <DataGrid
              aria-label="Задачи"
              columns={columns}
              groups={groups}
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
            <Bone h={56} className="rounded-[12px]" />
          </SkeletonGroup>
        ) : shown.length === 0 ? (
          <p className="px-1 text-[13px] leading-[18px] text-muted">Пока ни одного сообщения в задачах</p>
        ) : (
          <ul className="overflow-hidden rounded-[12px] border border-border bg-surface/40">
            {shown.map((m) => (
              <li key={m.id} className="border-t border-border/50 first:border-t-0">
                <button
                  type="button"
                  onClick={() => openTask(m.task_id)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 px-3 py-2 text-left transition-colors duration-[120ms] hover:bg-surface-2/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
                >
                  <span className="truncate text-[14px] leading-5">{messageLine(m)}</span>
                  <span className="nums shrink-0 text-[12px] leading-4 text-muted">{humanAqtobe(new Date(m.created_at), now)}</span>
                  <span className="col-span-2 truncate text-[12px] leading-4 text-muted">{m.task?.title ?? "Задача"}</span>
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
function CardFacts({ person, people, onEdit }: { person: Person; people: Person[]; onEdit?: () => void }) {
  const manager = person.manager_id ? people.find((p) => p.id === person.manager_id) : null;
  const muted = (text: string) => <span className="text-muted">{text}</span>;
  return (
    <div
      className={`rounded-[12px] border border-border bg-surface/40 ${onEdit ? "cursor-text" : ""}`}
      onDoubleClick={onEdit}
      title={onEdit ? "Двойной щелчок — изменить" : undefined}
      data-testid="desk-person-facts"
    >
      {person.role !== "tv" ? (
        <>
          <FormRow label="Должность" align="text">
            {person.position || muted("—")}
          </FormRow>
          <FormRow label="Как называет директор" align="text">
            {person.aliases.length ? (
              <span className="flex flex-wrap gap-1.5">
                {person.aliases.map((alias) => (
                  <span key={alias} className="inline-flex h-6 items-center rounded-[7px] border border-border bg-surface px-2 text-[13px] leading-4">
                    {alias}
                  </span>
                ))}
              </span>
            ) : (
              muted("—")
            )}
          </FormRow>
        </>
      ) : null}
      <FormRow label="Роль" align="text">
        {ROLE_LABEL[person.role]}
      </FormRow>
      {person.role !== "director" && person.role !== "tv" ? (
        <FormRow label="Руководитель" align="text">
          {manager?.full_name ?? muted("нет")}
        </FormRow>
      ) : null}
      {person.role !== "tv" ? (
        <FormRow label="Доступность" align="text">
          {person.is_active ? <Dot tone={AVAILABILITY_TONE[person.availability]}>{AVAILABILITY_LABEL[person.availability]}</Dot> : muted("не работает в компании")}
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
  const tone: Tone = !verdict ? "muted" : verdict.state === "ok" ? "ok" : verdict.state === "idle" ? "muted" : "danger";
  return (
    <Block title="Уведомления" testId="desk-person-push">
      <div className="rounded-[12px] border border-border bg-surface/40">
        <div className="flex min-h-12 items-center gap-3 px-4 py-2">
          <span className="min-w-0 flex-1 text-[14px] leading-5">
            <Dot tone={tone}>{verdict?.text ?? "…"}</Dot>
          </span>
          <Button size="sm" variant="secondary" disabled={test.busy} onClick={() => void test.run()} data-testid="desk-push-test">
            {test.busy ? "Проверяю…" : "Прислать проверку"}
          </Button>
        </div>
        {verdict && verdict.state !== "ok" ? (
          <p className="border-t border-border/60 px-4 py-2 text-[12px] leading-[17px] text-muted">
            Пока пуши не доходят, человек узнаёт о задачах, только открыв Pulse. Попросите открыть Pulse на телефоне и нажать «Включить уведомления»; на iPhone — сначала «На экран „Домой“».
          </p>
        ) : null}
        {test.verdict ? (
          <p
            className="border-t border-border/60 px-4 py-2 text-[13px] leading-4"
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
      <div className="grid gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
        <SkeletonGroup grow>
          <Bone h={140} className="rounded-[16px]" />
          <Bone h={200} className="mt-6 rounded-[12px]" />
        </SkeletonGroup>
        <SkeletonGroup>
          <Bone h={200} className="rounded-[12px]" />
          <Bone h={100} className="mt-6 rounded-[12px]" />
        </SkeletonGroup>
      </div>
    </DeskPage>
  );
}

/**
 * The person's card on the desk (D-153, tasks/022 B.2; wave 3): «Команда ›» over the name, the
 * moves in the head (Дать задачу — T, Изменить — E, «⋯»). On the left who the person is — and,
 * for the director, how loaded, today's report, the tasks and the last messages — and the card's
 * facts, which «Изменить» turns into fields in place (`?edit=1` opens it at once; Ctrl+S saves,
 * Esc cancels). On the right the login: the code with a large QR, the email, the password,
 * «Выйти со всех устройств» (`?login=1` — opened from the team's menu, the code's button under
 * the caret), and the pushes. The secretary gets what her phone editor gives her (D-104).
 */
export function PersonDesk({ id }: { id: string }) {
  const { role, pointsEnabled } = useDeskScope();
  const director = role === "director";
  const me = useMe();
  const person = usePerson(id);
  const people = usePeople();
  const update = useUpdatePerson();
  const now = useMinute();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const editing = params.get("edit") === "1";
  const focusLogin = params.get("login") === "1";
  // a person just created here: their code (or first password) comes with them, once
  const [handed] = useState(() => peekHandover(id));
  useEffect(() => dropHandover(id), [id]);

  const setEditing = (on: boolean) => router.replace(on ? `${pathname}?edit=1` : pathname, { scroll: false });

  const p = person.data;
  const editor: Who | null = me.data ? { id: me.data.userId, role: me.data.role } : null;
  const mayEdit = Boolean(p && editor && canEditPerson(editor, p));
  const works = Boolean(p?.is_active && p.role !== "tv");
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
      return false;
    },
    Boolean(p),
  );
  useShortcuts("Карточка сотрудника", [
    ...(mayEdit ? [{ keys: ["E"], label: "Изменить карточку" }] : []),
    ...(givable ? [{ keys: ["T"], label: "Дать задачу" }] : []),
    ...(mayEdit ? [{ keys: ["Ctrl S"], label: "Сохранить изменения" }, { keys: ["Esc"], label: "Отменить (дважды, если что-то вписано)" }] : []),
  ]);

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

  return (
    <DeskPage>
      {/* the card's light is the person's load — the director's only: the secretary reads no tasks (D-104) */}
      {director && works ? <LoadLight person={p} now={now} /> : null}
      <div className="flex flex-col gap-1">
        <nav aria-label="Путь" className="text-[13px] leading-5">
          <Link href={`/desk/team?p=${p.id}`} className="text-muted transition-colors hover:text-text" data-testid="desk-person-back">
            Команда
          </Link>
          <span aria-hidden className="px-1.5 text-muted/60">
            ›
          </span>
        </nav>
        <PageTitle
          title={p.full_name}
          actions={
            <>
              {givable ? (
                <Tooltip label="Строка поручения уже знает, кому" keys={["T"]} side="bottom">
                  <Button size="sm" data-testid="desk-person-give" onClick={give}>
                    Дать задачу
                  </Button>
                </Tooltip>
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
                  items={more}
                  label="Ещё"
                  className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[18px] leading-none text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  ⋯
                </MenuButton>
              ) : null}
            </>
          }
        />
      </div>
      {/* two columns while the screen's own width allows — the panel takes 440 px of the window */}
      <div className="@container">
        <div className="grid items-start gap-6 @min-[920px]:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]" data-testid="desk-person">
          <div className="flex min-w-0 flex-col gap-6">
            {director ? <DirectorHero person={p} companyId={me.data.companyId} pointsOn={pointsEnabled} now={now} /> : <Identity person={p} />}

            <Block
              title="Карточка"
              testId="desk-person-card"
              end={
                editing ? (
                  <span className="text-[12px] leading-4 text-muted">правка</span>
                ) : mayEdit ? (
                  <button type="button" onClick={() => setEditing(true)} className="text-[12px] font-medium leading-4 text-muted hover:text-text">
                    Изменить · E
                  </button>
                ) : null
              }
            >
              {!mayEdit ? (
                <>
                  <CardFacts person={p} people={roster} />
                  <p className="px-1 text-[12px] leading-4 text-muted">Карточку директора меняет только директор</p>
                </>
              ) : editing ? (
                <PersonEditor
                  key={p.id}
                  mode="edit"
                  initial={draftOf(p)}
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
                  pending={update.isPending}
                  onSubmit={async (draft) => {
                    await update.mutateAsync({ id, patch: patchOf(draft, access) });
                    setEditing(false);
                  }}
                  onCancel={() => setEditing(false)}
                />
              ) : (
                <CardFacts person={p} people={roster} onEdit={() => setEditing(true)} />
              )}
            </Block>

            {director ? <DirectorLists person={p} meId={me.data.userId} now={now} /> : null}
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            {/* a login just created is handed over even where it cannot be managed later (a new director) */}
            {manageLogin || handed ? <LoginBlock person={p} handed={handed} manage={manageLogin} focus={focusLogin} /> : null}
            {mayEdit && works ? <PushBlock userId={p.id} /> : null}
          </div>
        </div>
      </div>
    </DeskPage>
  );
}
