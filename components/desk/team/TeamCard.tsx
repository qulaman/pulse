"use client";

import { BellOff, CalendarOff, Phone, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { MenuButton, type MenuItem } from "@/components/desk/ui/Menu";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import { assignableRoles, canChangeAccess, canEditPerson, type Who } from "@/lib/people/access";
import { useSavePhone, useSavePhoto } from "@/lib/people/card-queries";
import type { Load } from "@/lib/people/loads";
import { cleanPhone, phoneHref } from "@/lib/people/phone";
import { AVAILABILITY_LABEL, ROLE_LABEL, useUpdatePerson, type Person } from "@/lib/people/queries";
import type { Health } from "@/lib/push/health";
import type { TaskWithPeople } from "@/lib/tasks/queries";

import { deskDraftOf, deskPatchOf } from "./draft";
import { CopyButton } from "./fields";
import { CardFacts, PushBlock } from "./PersonDesk";
import { OpenTasks } from "./PersonPeek";
import { PersonEditor } from "./PersonEditor";
import { loadWords, tidy } from "./shared";
import { TileFace, tileState } from "./TeamGrid";

/** The card's three faces: the numbers, the data (read or edited), the open work. */
export type CardTab = "stats" | "data" | "tasks";

export type CardMoves = {
  give?: () => void;
  /** the full card's page */
  open: () => void;
  more: MenuItem[];
};

/**
 * A person opened under their row of the grid (D-172): who — the circle, the name, the position,
 * the phone — with the moves at hand («Дать задачу», «Изменить», the full card, «⋯», ×), then three
 * tabs: «Показатели» — the director's dashboard of this person (`stats`), «Данные» — the card's facts,
 * a double click or «Изменить» turns them into the editor right here, and «Задачи» — what is open on
 * them. The secretary sees the data only (D-104).
 */
export function TeamCard({
  person,
  director,
  crew,
  me,
  companyId,
  roster,
  phone,
  phonesReady,
  load,
  tasks,
  push,
  now,
  tab,
  onTab,
  editing,
  onEditing,
  moves,
  onClose,
  stats,
}: {
  person: Person;
  director: boolean;
  /** a person who gets the work: the dashboard and the tasks are theirs */
  crew: boolean;
  me: Who;
  companyId: string | undefined;
  roster: Person[];
  phone: string | null;
  /** the phones came: the editor starts from the real number, not an empty field */
  phonesReady: boolean;
  load?: Load;
  tasks: TaskWithPeople[];
  push?: Health;
  now: Date;
  tab: CardTab;
  onTab: (tab: CardTab) => void;
  editing: boolean;
  onEditing: (on: boolean) => void;
  moves: CardMoves;
  onClose: () => void;
  /** the dashboard, rendered by the screen (components/desk/team/PersonStats.tsx) */
  stats: ReactNode;
}) {
  const update = useUpdatePerson();
  const savePhoto = useSavePhoto();
  const savePhone = useSavePhone();
  const mayEdit = canEditPerson(me, person);
  const access = canChangeAccess(me, person);
  const works = person.is_active && person.role !== "tv";
  const showStats = director && crew && Boolean(stats);
  const showTasks = director && works;
  const tabs = [
    ...(showStats ? [{ value: "stats" as const, label: "Показатели" }] : []),
    { value: "data" as const, label: editing ? "Данные · правка" : "Данные" },
    ...(showTasks ? [{ value: "tasks" as const, label: "Задачи", count: tasks.length }] : []),
  ];
  const current: CardTab = tabs.some((item) => item.value === tab) ? tab : tabs[0].value;
  const state = tileState(person, load, crew);
  const position = person.position && person.position.toLowerCase() !== ROLE_LABEL[person.role].toLowerCase() ? person.position : null;
  const away = person.is_active && person.role !== "tv" && person.availability !== "active";
  const deaf = push && (push.state === "off" || push.state === "broken");
  const edit = () => {
    onTab("data");
    onEditing(true);
  };

  return (
    <article className="team-card" data-testid="team-card" data-person={person.id} aria-label={`Карточка: ${person.full_name}`}>
      <header className="team-card-head">
        <TileFace person={person} size={72} state={state} />
        <div className="min-w-0 flex-1">
          <h2 className="team-card-name" title={person.full_name}>
            {person.full_name}
          </h2>
          <p className="team-card-line">
            {[position, ROLE_LABEL[person.role], person.is_active ? null : "не в команде"].filter(Boolean).join(" · ")}
          </p>
          <p className="team-card-chips">
            {away ? (
              <span className="team-chip" data-tone="muted">
                <CalendarOff size={13} strokeWidth={2.25} aria-hidden />
                {AVAILABILITY_LABEL[person.availability].toLowerCase()}
              </span>
            ) : null}
            {director && crew && person.is_active ? (
              <span className="team-chip" data-tone={(load?.overdue ?? 0) > 0 ? "danger" : (load?.active ?? 0) > 0 ? "ok" : "muted"}>
                {loadWords(load)}
              </span>
            ) : null}
            {phone ? (
              <span className="team-chip" data-tone="muted">
                <Phone size={13} strokeWidth={2.25} aria-hidden />
                <a href={phoneHref(phone)} className="nums hover:underline" data-testid="team-card-phone">
                  {phone}
                </a>
                <CopyButton text={() => phone} label="Скопировать телефон" done="Скопировал телефон" />
              </span>
            ) : null}
            {deaf ? (
              <span className="team-chip" data-tone="danger" title="Пока пуши не доходят, человек узнаёт о задачах, только открыв Pulse">
                <BellOff size={13} strokeWidth={2.25} aria-hidden />
                {push?.state === "broken" ? "пуш не прошёл" : "уведомления не включены"}
              </span>
            ) : null}
          </p>
        </div>
        <div className="team-card-moves">
          {moves.give ? (
            <Tooltip label="Строка поручения уже знает, кому" keys={["T"]} side="bottom">
              <Button size="sm" onClick={moves.give} data-testid="team-card-give">
                Дать задачу
              </Button>
            </Tooltip>
          ) : null}
          {mayEdit && !editing ? (
            <Tooltip label="Изменить карточку здесь" keys={["E"]} side="bottom">
              <Button size="sm" variant="secondary" onClick={edit} data-testid="team-card-edit">
                Изменить
              </Button>
            </Tooltip>
          ) : null}
          <Tooltip label="Полная карточка" keys={["Enter"]} side="bottom">
            <Link href={`/desk/team/${person.id}`} className="btn-secondary inline-flex h-9 items-center px-3 text-[13px] font-medium leading-4" data-testid="team-card-open" onClick={(event) => {
              event.preventDefault();
              moves.open();
            }}>
              Открыть
            </Link>
          </Tooltip>
          {moves.more.length > 0 ? (
            <MenuButton
              items={tidy(moves.more)}
              label="Ещё"
              className="flex h-9 w-9 items-center justify-center rounded-[8px] text-[18px] leading-none text-muted hover:bg-surface-2 hover:text-text"
            >
              ⋯
            </MenuButton>
          ) : null}
          <Tooltip label="Закрыть" keys={["Esc"]} side="bottom">
            <button type="button" aria-label="Закрыть карточку" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-[8px] text-muted hover:bg-surface-2 hover:text-text" data-testid="team-card-close">
              <X size={18} strokeWidth={2} aria-hidden />
            </button>
          </Tooltip>
        </div>
      </header>

      {tabs.length > 1 ? (
        <div className="team-card-tabs">
          <SegmentTabs value={current} onChange={(next) => onTab(next)} items={tabs} aria-label="Карточка" />
        </div>
      ) : null}

      <div key={current} className="team-card-body @container" data-testid={`team-card-${current}`}>
        {current === "stats" ? stats : null}
        {current === "tasks" ? <OpenTasks tasks={tasks} personId={person.id} now={now} /> : null}
        {current === "data" ? (
          <div className="grid items-start gap-x-10 gap-y-6 @min-[900px]:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
            <div className="min-w-0">
              {!mayEdit ? (
                <>
                  <CardFacts person={person} phone={phone} people={roster} />
                  <p className="pt-2 text-[12px] leading-4 text-muted">Карточку директора меняет только директор</p>
                </>
              ) : editing && !phonesReady ? null : editing ? (
                <PersonEditor
                  key={person.id}
                  mode="edit"
                  draftKey={person.id}
                  photoUrl={person.avatar_url}
                  initial={deskDraftOf(person, phone)}
                  roles={assignableRoles(me.role, person.role)}
                  lockedRole={
                    access
                      ? undefined
                      : me.id === person.id
                        ? "Свою роль и доступ здесь не меняют — иначе можно закрыть себе вход в настройки"
                        : "Роль директора меняет только директор"
                  }
                  managers={roster.filter((m) => m.id !== person.id && m.is_active && (m.role === "manager" || m.role === "director"))}
                  roster={roster.filter((m) => m.id !== person.id && m.is_active && m.role !== "tv")}
                  pending={update.isPending || savePhoto.isPending || savePhone.isPending}
                  onSubmit={async (draft, photo, { leaving }) => {
                    if (!companyId) throw new Error("Нет компании — обновите страницу");
                    // the photo first: it is what fails, and then nothing else has been written
                    await savePhoto.mutateAsync({ id: person.id, companyId, photo });
                    await update.mutateAsync({ id: person.id, patch: deskPatchOf(draft, access) });
                    const typed = cleanPhone(draft.phone);
                    if (typed !== phone) await savePhone.mutateAsync({ id: person.id, companyId, phone: typed });
                    if (!leaving) onEditing(false);
                  }}
                  onCancel={() => onEditing(false)}
                />
              ) : (
                <CardFacts person={person} phone={phone} people={roster} onEdit={edit} />
              )}
            </div>
            {mayEdit && works && !editing ? (
              <div className="min-w-0">
                <PushBlock userId={person.id} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
