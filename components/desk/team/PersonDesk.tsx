"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DataGrid, type Column, type Group } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { DeskLight } from "@/components/desk/ui/Light";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { Avatar } from "@/components/desk/ui/PersonCell";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { PersonPushCard } from "@/components/people/PersonPushCard";
import { draftOf, patchOf } from "@/components/people/PersonForm";
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
import { useComposeStore } from "@/lib/store/compose";
import { useMe, useSentTasks, type TaskWithPeople } from "@/lib/tasks/queries";
import { SHORT_STATUS, STATUS_LABEL, deadlineLabel, isOverdue, type TaskStatus } from "@/lib/tasks/status-text";
import { toneOf } from "@/lib/tasks/tone";

import { dropHandover, peekHandover } from "./handoff";
import { HeroFacts, type HeroFact } from "./Hero";
import { LoginBlock } from "./LoginBlock";
import { PersonEditor } from "./PersonEditor";
import { addressOf, AVAILABILITY_TONE, Block, Dot, GridBone, LOAD_TONE, RING_TONE } from "./shared";

const OPEN: TaskStatus[] = ["scheduled", "sent", "accepted", "in_progress", "rework"];
const CLOSED: TaskStatus[] = ["done", "declined", "revoked"];

/** The light of the card in the tone of the person's load (D-154): late — red, a deadline close — amber, on time — green. */
function LoadLight({ person, now }: { person: Person; now: Date }) {
  const loads = useTeamLoads();
  if (loads.isLoading) return null;
  return <DeskLight tone={LOAD_TONE[loadColor(loads.data?.[person.id], person.availability === "active", now.getTime())]} />;
}

/** «Сотрудник · Снабженец» — the role, and the position when it says more than the role. */
function roleLine(person: Person): string {
  const position = person.position && person.position.toLowerCase() !== ROLE_LABEL[person.role].toLowerCase() ? person.position : null;
  return [ROLE_LABEL[person.role], position].filter(Boolean).join(" · ");
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
 * Who the person is — the card's hero, raised over the flat lists (D-154): the circle with the
 * ring of their load, the name, the role and a state only when there is one, the spoken forms;
 * under it what the director reads and does (`children`).
 */
function Identity({ person, ring, children }: { person: Person; ring?: Tone | null; children?: ReactNode }) {
  return (
    <section className="card flex flex-col gap-4 px-5 py-4" style={{ boxShadow: "var(--shadow-raised)" }} data-testid="desk-person-identity">
      <div className="flex items-center gap-4">
        <span className={person.is_active ? "" : "opacity-55"}>
          <Avatar name={person.full_name} ring={ring} size={56} />
        </span>
        {/* the name is the screen's title right above: here — who they are at work and how they are called */}
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
          {person.aliases.length > 0 ? <p className="mt-1 text-[13px] leading-4 text-muted">В речи: {person.aliases.join(", ")}</p> : null}
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

/** The director's half of the card: the load as numbers that lead to the tasks, the points, «Дать задачу», their tasks and what they wrote. */
function DirectorSide({ person, meId, companyId, pointsOn, now }: { person: Person; meId: string; companyId: string | undefined; pointsOn: boolean; now: Date }) {
  const router = useRouter();
  const loads = useTeamLoads();
  const balances = useTeamBalances(pointsOn);
  const sent = useSentTasks(meId);
  const messages = usePersonMessages(person.id);
  const [showClosed, setShowClosed] = useState(false);

  const load = loads.data?.[person.id];
  const works = person.is_active && person.role !== "tv";
  // a director gets no orders here, and nobody gives one to themselves
  const givable = works && person.role !== "director" && person.id !== meId;
  // a director's card shows the load only when somebody did give them a task
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

  const columns: Column<TaskWithPeople>[] = [
    { key: "title", title: "Задача", render: (t) => <span className="block truncate" title={t.title}>{t.title}</span> },
    {
      key: "status",
      title: "Статус",
      width: "140px",
      // late is told by the colour, the word stays the state's (lib/tasks/status-text)
      render: (t) => <Dot tone={toneOf(t.status, isOverdue(t, now))}>{SHORT_STATUS[t.status]}</Dot>,
    },
    {
      key: "deadline",
      title: "Срок",
      width: "150px",
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
      <Identity person={person} ring={loaded ? RING_TONE[loadColor(load, person.availability === "active", now.getTime())] : null}>
        {loaded ? (
          <>
            <div className="border-t border-border/60 pt-3">
              {loads.isLoading ? <span className="skeleton block h-[52px] w-[280px] rounded-[10px] bg-surface-2" /> : <HeroFacts facts={facts} className="-ml-3" />}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {givable ? (
                // the person is known by id: the pin in the order line, the parser does not guess (D-84)
                <Button
                  size="sm"
                  data-testid="desk-person-give"
                  onClick={() => useComposeStore.getState().request("", { id: person.id, name: person.full_name, address: addressOf(person) })}
                >
                  Дать задачу
                </Button>
              ) : null}
              <TodayReport personId={person.id} companyId={companyId} now={now} />
            </div>
          </>
        ) : null}
      </Identity>

      {loaded || tasks.length > 0 ? (
        <Block
          title="Задачи"
          count={review.length + open.length}
          testId="desk-person-tasks"
          end={
            <>
              {closed.length > 0 ? (
                <button type="button" className="text-[13px] leading-4 text-muted hover:text-text" onClick={() => setShowClosed((v) => !v)} aria-expanded={showClosed}>
                  {showClosed ? "Скрыть закрытые" : `Закрытые · ${closed.length}`}
                </button>
              ) : null}
              {tasks.length > 0 ? (
                <Link href={tasksOf} className="text-[13px] leading-4 text-muted hover:text-text">
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
              empty={<EmptyState tone={works ? "ok" : undefined} title="Открытых задач нет" hint={givable ? "«Дать задачу» — и строка поручения уже знает, кому" : undefined} />}
            />
          )}
        </Block>
      ) : null}

      <Block title="Последние сообщения" testId="desk-person-messages">
        {messages.isLoading ? (
          <SkeletonGroup>
            <Bone h={56} className="rounded-[12px]" />
          </SkeletonGroup>
        ) : !(messages.data ?? []).some((m) => messageLine(m)) ? (
          <p className="px-1 text-[13px] leading-[18px] text-muted">Пока ни одного сообщения в задачах</p>
        ) : (
          <ul className="overflow-hidden rounded-[12px] border border-border bg-surface/40">
            {(messages.data ?? [])
              .filter((m) => messageLine(m))
              .slice(0, 10)
              .map((m) => (
                <li key={m.id} className="border-t border-border/50 first:border-t-0">
                  <button type="button" onClick={() => openTask(m.task_id)} className="block w-full px-3 py-2 text-left transition-colors duration-[120ms] hover:bg-surface-2/55">
                    <span className="flex items-baseline justify-between gap-2 text-[12px] leading-4 text-muted">
                      <span className="truncate">{m.task?.title ?? "Задача"}</span>
                      <span className="nums shrink-0">{humanAqtobe(new Date(m.created_at), now)}</span>
                    </span>
                    <span className="mt-0.5 block text-[14px] leading-5">{messageLine(m)}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </Block>
    </>
  );
}

/** The card's fields read, not edited: what «Изменить» opens. */
function CardFacts({ person, people }: { person: Person; people: Person[] }) {
  const manager = person.manager_id ? people.find((p) => p.id === person.manager_id) : null;
  const rows: [string, ReactNode][] = [
    ["Должность", person.position || "—"],
    ["Как называет директор", person.aliases.length ? person.aliases.join(", ") : "—"],
    ["Роль", ROLE_LABEL[person.role]],
  ];
  if (person.role !== "director" && person.role !== "tv") rows.push(["Руководитель", manager?.full_name ?? "нет"]);
  if (person.role !== "tv") {
    rows.push([
      "Доступность",
      person.is_active ? <Dot tone={AVAILABILITY_TONE[person.availability]}>{AVAILABILITY_LABEL[person.availability]}</Dot> : <span className="text-muted">не работает</span>,
    ]);
  }
  return (
    <dl className="card overflow-hidden">
      {rows.map(([label, value]) => (
        <div key={label} className="flex min-h-10 items-center gap-3 border-t border-border/60 px-4 py-2 first:border-t-0">
          <dt className="w-44 shrink-0 text-[13px] leading-4 text-muted">{label}</dt>
          <dd className="min-w-0 flex-1 truncate text-[14px] leading-5">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PersonBone() {
  return (
    <DeskPage>
      <SkeletonGroup>
        <Bone h={30} w={260} />
        <Bone h={20} w={180} className="mt-1" />
      </SkeletonGroup>
      <div className="grid gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(380px,480px)]">
        <SkeletonGroup grow>
          <Bone h={168} className="rounded-[16px]" />
          <Bone h={200} className="mt-6 rounded-[12px]" />
        </SkeletonGroup>
        <SkeletonGroup>
          <Bone h={200} className="rounded-[16px]" />
          <Bone h={240} className="mt-6 rounded-[16px]" />
        </SkeletonGroup>
      </div>
    </DeskPage>
  );
}

/**
 * The person's card on the desk (D-153, tasks/022 B.2): two columns. On the left who the person
 * is — and, for the director, how loaded, the points, «Дать задачу» into the order line, the
 * tasks and the last messages. On the right the editor (`?edit=1` opens it at once) and the
 * login: the code with a large QR, the email and the password, «Выйти со всех устройств», the
 * pushes. The secretary gets what her phone editor gives her (D-104), nothing more: the card,
 * the role, the login — no tasks, no points, no orders.
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
  // a person just created here: their code (or first password) comes with them, once
  const [handed] = useState(() => peekHandover(id));
  useEffect(() => dropHandover(id), [id]);

  const setEditing = (on: boolean) => router.replace(on ? `${pathname}?edit=1` : pathname, { scroll: false });

  if (person.isLoading || people.isLoading || !me.data) return <PersonBone />;
  const p = person.data;
  if (!p) {
    return (
      <DeskPage>
        <PageTitle title="Сотрудник не найден" />
        <EmptyState title="Такого человека нет в команде" hint="Возможно, ссылка устарела — откройте «Команду»" />
      </DeskPage>
    );
  }

  const editor: Who = { id: me.data.userId, role: me.data.role };
  const mayEdit = canEditPerson(editor, p);
  const access = canChangeAccess(editor, p);
  const roster = people.data ?? [];

  const works = p.is_active && p.role !== "tv";

  return (
    <DeskPage>
      {/* the card's light is the person's load — the director's only: the secretary reads no tasks (D-104) */}
      {director && works ? <LoadLight person={p} now={now} /> : null}
      <PageTitle title={p.full_name} />
      {/* two columns while the screen's own width allows — the panel takes 440 px of the window */}
      <div className="@container">
        <div className="grid items-start gap-6 @min-[900px]:grid-cols-[minmax(0,1fr)_minmax(380px,480px)]" data-testid="desk-person">
          <div className="flex min-w-0 flex-col gap-6">
            {director ? (
              <DirectorSide person={p} meId={me.data.userId} companyId={me.data.companyId} pointsOn={pointsEnabled} now={now} />
            ) : (
              <Identity person={p} />
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <Block
              title="Карточка"
              testId="desk-person-card"
              end={
                mayEdit && !editing ? (
                  <Button size="sm" variant="secondary" onClick={() => setEditing(true)} data-testid="desk-person-edit">
                    Изменить
                  </Button>
                ) : null
              }
            >
              {!mayEdit ? (
                <p className="card px-4 py-5 text-center text-[14px] leading-5 text-muted">Карточку директора меняет только директор</p>
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
                <CardFacts person={p} people={roster} />
              )}
            </Block>

            {/* a login just created is handed over even where it cannot be managed later (a new director) */}
            {canResetLogin(editor, p) || handed ? <LoginBlock person={p} handed={handed} manage={canResetLogin(editor, p)} /> : null}

            {/* does their phone hear the work (D-114): the truth and «Прислать проверку», no switches */}
            {mayEdit && p.is_active && p.role !== "tv" ? (
              <div className="[&>section]:mt-0">
                <PersonPushCard userId={p.id} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </DeskPage>
  );
}
