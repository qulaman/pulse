"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DataGrid, type Column, type Group } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { StatTile } from "@/components/desk/ui/StatTile";
import { TONE_VAR } from "@/components/desk/ui/tone";
import { PersonPushCard } from "@/components/people/PersonPushCard";
import { draftOf, patchOf } from "@/components/people/PersonForm";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { assignableRoles, canChangeAccess, canEditPerson, canResetLogin, type Who } from "@/lib/people/access";
import { useTeamLoads } from "@/lib/people/loads";
import {
  AVAILABILITY_LABEL,
  ROLE_LABEL,
  initialsOf,
  usePeople,
  usePerson,
  usePersonMessages,
  useUpdatePerson,
  type Person,
} from "@/lib/people/queries";
import { useTeamBalances } from "@/lib/points/queries";
import { useComposeStore } from "@/lib/store/compose";
import { useMe, useSentTasks, type TaskWithPeople } from "@/lib/tasks/queries";
import { SHORT_STATUS, STATUS_LABEL, deadlineLabel, isOverdue, type TaskStatus } from "@/lib/tasks/status-text";
import { deadlineToneOf, toneOf } from "@/lib/tasks/tone";

import { dropHandover, peekHandover } from "./handoff";
import { LoginBlock } from "./LoginBlock";
import { PersonEditor } from "./PersonEditor";
import { AVAILABILITY_TONE, Block, Dot, GridBone, addressOf } from "./shared";

const OPEN: TaskStatus[] = ["scheduled", "sent", "accepted", "in_progress", "rework"];
const CLOSED: TaskStatus[] = ["done", "declined", "revoked"];

/** Who the person is: the initials, the name, role and state as chips, the spoken forms. */
function Identity({ person, children }: { person: Person; children?: ReactNode }) {
  return (
    <div className="card flex flex-col gap-4 p-4" data-testid="desk-person-identity">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-display text-[19px] font-bold text-bg"
          style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))", opacity: person.is_active ? 1 : 0.55 }}
        >
          {initialsOf(person.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[17px] font-semibold leading-[22px]">{person.full_name}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Chip tone="neutral" interactive={false}>
              {ROLE_LABEL[person.role]}
            </Chip>
            {person.is_active && person.role !== "tv" ? (
              <Chip tone={person.availability === "active" ? "ok" : "warn"} interactive={false}>
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
      {person.aliases.length > 0 ? <p className="text-[13px] leading-4 text-muted">В речи: {person.aliases.join(", ")}</p> : null}
      {children}
    </div>
  );
}

/** The director's half of the card: the load, the points, «Дать задачу», their tasks and what they wrote. */
function DirectorSide({ person, meId, pointsOn }: { person: Person; meId: string; pointsOn: boolean }) {
  const router = useRouter();
  const loads = useTeamLoads();
  const balances = useTeamBalances(pointsOn);
  const sent = useSentTasks(meId);
  const messages = usePersonMessages(person.id);
  const [showClosed, setShowClosed] = useState(false);
  // the clock is read once per mount: a lazy initializer is allowed where render is not
  const [now] = useState(() => new Date());

  const load = loads.data?.[person.id];
  const works = person.is_active && person.role !== "tv";
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
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>("[data-row-key]")?.dataset.rowKey;
    if (key) openTask(key);
  };

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
        const tone = deadlineToneOf(t, now);
        return (
          <span className="nums" style={{ color: label.none ? "var(--text-muted)" : CLOSED.includes(t.status) ? undefined : TONE_VAR[tone] }}>
            {label.text}
          </span>
        );
      },
    },
  ];

  const dash = loads.isLoading ? "…" : null;
  return (
    <>
      <Identity person={person}>
        {works ? (
          <>
            <div className="flex flex-wrap gap-2">
              <StatTile label="В работе" value={dash ?? (load ? load.active - load.review : 0)} tone="ok" />
              <StatTile label="Просрочено" value={dash ?? (load?.overdue ?? 0)} tone="danger" />
              <StatTile label="На приёмке" value={dash ?? (load?.review ?? 0)} tone="warn" />
              {pointsOn && person.role !== "director" ? (
                <StatTile label="Очки" value={balances.isLoading ? "…" : (balances.data?.[person.id] ?? 0)} tone="gold" />
              ) : null}
            </div>
            <div>
              {/* the person is known by id: the pin in the order line, the parser does not guess (D-84) */}
              <Button
                size="sm"
                data-testid="desk-person-give"
                onClick={() => useComposeStore.getState().request("", { id: person.id, name: person.full_name, address: addressOf(person) })}
              >
                Дать задачу
              </Button>
            </div>
          </>
        ) : null}
      </Identity>

      <Block
        title={`Задачи · ${review.length + open.length}`}
        testId="desk-person-tasks"
        end={
          closed.length > 0 ? (
            <button type="button" className="text-[13px] leading-4 text-muted hover:text-text" onClick={() => setShowClosed((v) => !v)} aria-expanded={showClosed}>
              {showClosed ? "Скрыть закрытые" : `Закрытые · ${closed.length}`}
            </button>
          ) : null
        }
      >
        {sent.isLoading ? (
          <GridBone rows={3} columns={3} />
        ) : (
          <div onClick={onClick}>
            <DataGrid
              aria-label="Задачи"
              columns={columns}
              groups={groups}
              rowKey={(t) => t.id}
              onActivate={(t) => openTask(t.id)}
              rowTone={(t) => toneOf(t.status, isOverdue(t, now))}
              empty={<EmptyState title="Открытых задач нет" hint={works ? "«Дать задачу» — и строка поручения уже знает, кому" : undefined} />}
            />
          </div>
        )}
      </Block>

      <Block title="Последние сообщения" testId="desk-person-messages">
        {messages.isLoading ? (
          <SkeletonGroup>
            <Bone h={56} className="rounded-[12px]" />
          </SkeletonGroup>
        ) : (messages.data ?? []).length === 0 ? (
          <p className="px-1 text-[13px] leading-[18px] text-muted">Пока ни одного сообщения в задачах</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {(messages.data ?? []).slice(0, 10).map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => openTask(m.task_id)}
                  className="block w-full rounded-[12px] border border-border bg-surface px-3 py-2 text-left transition-colors duration-[120ms] hover:border-muted/50"
                >
                  <span className="flex items-baseline justify-between gap-2 text-[12px] leading-4 text-muted">
                    <span className="truncate">{m.task?.title ?? "Задача"}</span>
                    <span className="nums shrink-0">{humanAqtobe(new Date(m.created_at), now)}</span>
                  </span>
                  <span className="mt-0.5 block text-[14px] leading-5">
                    {m.type === "status_change"
                      ? `→ ${STATUS_LABEL[(m.meta as { new_status?: TaskStatus })?.new_status ?? "sent"] ?? "статус"}`
                      : m.type === "photo"
                        ? `📷 ${m.content ?? "фото к отчёту"}`
                        : m.content}
                  </span>
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

  return (
    <DeskPage>
      <PageTitle
        title={p.full_name}
        state={{
          text: [ROLE_LABEL[p.role], p.position?.toLowerCase() === ROLE_LABEL[p.role].toLowerCase() ? null : p.position, p.is_active ? null : "не работает"]
            .filter(Boolean)
            .join(" · "),
        }}
      />
      {/* two columns while the screen's own width allows — the panel takes 440 px of the window */}
      <div className="@container">
        <div className="grid items-start gap-6 @min-[900px]:grid-cols-[minmax(0,1fr)_minmax(380px,480px)]" data-testid="desk-person">
          <div className="flex min-w-0 flex-col gap-6">
            {director ? <DirectorSide person={p} meId={me.data.userId} pointsOn={pointsEnabled} /> : <Identity person={p} />}
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
