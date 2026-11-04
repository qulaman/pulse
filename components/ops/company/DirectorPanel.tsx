"use client";

import { useState } from "react";

import { INPUT } from "@/components/desk/team/fields";
import { Dialog } from "@/components/desk/ui/Dialog";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { SettingGroup, SettingRow } from "@/components/desk/ui/SettingRow";
import { Select } from "@/components/desk/ui/Toolbar";
import { ActionDialog } from "@/components/ops/ActionDialog";
import { CodeShow } from "@/components/ops/company/CodeShow";
import { Choice, Field, Outcome, OutcomeLine, useOnce } from "@/components/ops/company/shared";
import { emailReady, roleText } from "@/components/ops/company/words";
import { When } from "@/components/ops/shell/When";
import { Button } from "@/components/ui/Button";
import { newRequestId } from "@/lib/ops/client";
import { useChangeDirector } from "@/lib/ops/company-queries";
import { type CardPerson, type ChangeDirectorAnswer, type CompanyCard, type OLD_FATES } from "@/lib/ops/contract";
import { pluralRu } from "@/lib/tasks/status-text";

type Fate = (typeof OLD_FATES)[number];
type Source = "people" | "new";

const FATES: { value: Fate; title: string; hint: string }[] = [
  { value: "deactivate", title: "Уходит из компании", hint: "Вход закроется сразу на всех устройствах, в «Людях» он останется с пометкой «не работает»." },
  { value: "demote", title: "Остаётся сотрудником", hint: "Работает дальше как обычный сотрудник, задачи получает как все." },
  { value: "keep", title: "Пока остаётся директором", hint: "В компании будет два директора. Подходит только на время передачи дел." },
];

const count = (value: number, forms: [string, string, string]) => `${value} ${pluralRu(value, forms)}`;

/** The result of a change: the moved numbers, and a way in when a new person was created. */
function DoneDialog({ name, answer, onClose }: { name: string; answer: ChangeDirectorAnswer; onClose: () => void }) {
  const { moved } = answer;
  return (
    <Dialog open onClose={onClose} title="Директор сменён" width="md">
      <div className="flex flex-col gap-4" data-testid="ops-director-done">
        <Outcome title={`Итог · директор теперь ${name}`}>
          <OutcomeLine count={moved.tasks}>Перешло открытых задач</OutcomeLine>
          <OutcomeLine count={moved.rules}>Перешло повторов</OutcomeLine>
          <OutcomeLine count={moved.events}>Перешло будущих встреч</OutcomeLine>
          <OutcomeLine count={moved.errands_cancelled}>Отменено заявок секретарю</OutcomeLine>
        </Outcome>
        {answer.login ? <CodeShow login={answer.login} /> : null}
        <div className="flex justify-end">
          <Button size="sm" onClick={onClose} data-autofocus>
            Готово
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ChangeDialog({ card, old, onClose, onDone }: { card: CompanyCard; old: CardPerson; onClose: () => void; onDone: (name: string, answer: ChangeDirectorAnswer) => void }) {
  const requestId = useOnce(newRequestId);
  const change = useChangeDirector(card.id);
  const candidates = card.people.filter((person) => person.id !== old.id && person.role !== "tv" && person.is_active);

  const [source, setSource] = useState<Source>(candidates.length > 0 ? "people" : "new");
  const [newId, setNewId] = useState("");
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [fate, setFate] = useState<Fate | null>(null);

  const badEmail = email.trim() !== "" && !emailReady(email);
  const successor = source === "people" ? newId !== "" : name.trim().length >= 2 && !badEmail;

  return (
    <ActionDialog
      title={`Сменить директора · ${old.full_name}`}
      confirmLabel="Сменить директора"
      danger
      disabled={!successor || fate === null}
      onClose={onClose}
      onSubmit={async (reason) => {
        if (fate === null) return;
        const answer = await change.mutateAsync({
          old_id: old.id,
          old_fate: fate,
          reason,
          client_request_id: requestId,
          ...(source === "people"
            ? { new_id: newId }
            : { new_person: { full_name: name.trim(), position: position.trim() || undefined, email: email.trim().toLowerCase() || undefined } }),
        });
        onDone(source === "people" ? (candidates.find((person) => person.id === newId)?.full_name ?? "") : name.trim(), answer);
      }}
    >
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium leading-5 text-muted">Кто становится директором</p>
        <Choice
          name="ops-successor"
          label="Откуда новый директор"
          value={source}
          onChange={setSource}
          items={[
            { value: "people", title: "Человек из компании" },
            { value: "new", title: "Новый человек", hint: "Создаётся сразу директором, код входа покажется после смены." },
          ]}
        />
        {source === "people" ? (
          candidates.length > 0 ? (
            <Select className="w-full" value={newId} aria-label="Новый директор" data-autofocus onChange={(event) => setNewId(event.target.value)} data-testid="ops-director-new">
              <option value="">Выбери человека</option>
              {candidates.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name} · {roleText(person.role)}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-[13px] leading-[18px] text-muted">Больше в компании никого нет, нужен новый человек.</p>
          )
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Имя и фамилия">
              <input className={INPUT} value={name} data-autofocus autoComplete="off" maxLength={120} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Должность" hint="Необязательно">
              <input className={INPUT} value={position} autoComplete="off" maxLength={120} onChange={(event) => setPosition(event.target.value)} />
            </Field>
            <Field label="Почта" hint="Необязательно" error={badEmail ? "Похоже, в почте опечатка" : null}>
              <input type="email" className={INPUT} value={email} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(event) => setEmail(event.target.value)} />
            </Field>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium leading-5 text-muted">Что будет с прежним директором</p>
        <Choice name="ops-fate" label="Судьба прежнего директора" value={fate} onChange={setFate} items={FATES} />
      </div>

      <div className="grid grid-cols-2 gap-3" data-testid="ops-director-preview">
        <Outcome title="Перейдёт новому">
          <OutcomeLine>Открытые задачи, он станет их автором</OutcomeLine>
          <OutcomeLine>Повторяющиеся задачи</OutcomeLine>
          <OutcomeLine>Будущие встречи и участие в них</OutcomeLine>
          <OutcomeLine>Подчинённые прежнего директора</OutcomeLine>
        </Outcome>
        <Outcome title="Останется за прежним">
          <OutcomeLine>Закрытые и отозванные задачи</OutcomeLine>
          <OutcomeLine>Сообщения и реакции</OutcomeLine>
          <OutcomeLine>Очки, объявления, отчёты</OutcomeLine>
          <OutcomeLine>Заметки, доски, настройки уведомлений</OutcomeLine>
        </Outcome>
      </div>
      <p className="text-[13px] leading-[18px] text-muted">
        Открытые заявки прежнего директора секретарю отменятся, его доски уйдут со стены. В переписке перенесённых задач появится служебная строка. Уведомлений никто не получит.
      </p>
    </ActionDialog>
  );
}

/** «Директор»: who holds the post now (there may be several), and the change of the post in one transaction. */
export function DirectorPanel({ card }: { card: CompanyCard }) {
  const [changing, setChanging] = useState<CardPerson | null>(null);
  const [done, setDone] = useState<{ name: string; answer: ChangeDirectorAnswer } | null>(null);
  const directors = card.people.filter((person) => person.role === "director");

  return (
    <div className="flex max-w-[808px] flex-col gap-2" data-testid="ops-director">
      <SectionLabel count={directors.length}>Сейчас директор</SectionLabel>
      {directors.length === 0 ? (
        <EmptyState title="Директора нет" hint="Сменить можно только действующего директора. Загляни в журнал: как компания осталась без него." />
      ) : (
        <SettingGroup>
          {directors.map((person) => (
            <SettingRow
              key={person.id}
              label={person.full_name}
              hint={
                <>
                  {person.position ? `${person.position} · ` : ""}
                  {person.is_active ? count(person.sessions, ["вход", "входа", "входов"]) : "не работает"}
                  {person.email ? ` · ${person.email}` : ""}
                  {" · последний вход "}
                  <When iso={person.last_seen_at} />
                </>
              }
            >
              <Button size="sm" variant="secondary" onClick={() => setChanging(person)} data-testid="ops-director-change">
                Сменить
              </Button>
            </SettingRow>
          ))}
        </SettingGroup>
      )}

      {changing ? <ChangeDialog card={card} old={changing} onClose={() => setChanging(null)} onDone={(name, answer) => setDone({ name, answer })} /> : null}
      {done ? <DoneDialog name={done.name} answer={done.answer} onClose={() => setDone(null)} /> : null}
    </div>
  );
}
