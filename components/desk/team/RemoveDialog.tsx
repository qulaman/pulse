"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { SegmentTabs, Select } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { reassignTask, revokeTask, setWorking as writeWorking, useDeletePerson, useSetManager, useSetWorking, useStanding } from "@/lib/people/card-queries";
import { passAll, type Failed, type OpenTask, type OpenWork } from "@/lib/people/handover";
import { historyWords } from "@/lib/people/history";
import { AVAILABILITY_LABEL, peopleKeys, type Person } from "@/lib/people/queries";
import { taskKeys } from "@/lib/tasks/queries";

import { Face, counted, roleLine } from "./shared";

const TASK_FORMS: [string, string, string] = ["открытая задача", "открытые задачи", "открытых задач"];

/**
 * What the dialog does: `remove` — the one «Удалить…» of a person at work; `erase` — «Удалить
 * насовсем…» of a person who has left; `pass` — only hand over what a person who left still holds.
 */
export type RemoveMode = "remove" | "erase" | "pass";

/** «3 можно передать · 1 на приёмке · 1 отложена». */
function workLine(open: OpenWork): string {
  return [
    open.movable > 0 ? `${open.movable} можно передать` : null,
    open.review > 0 ? `${open.review} на приёмке` : null,
    open.scheduled > 0 ? `${open.scheduled} ${open.scheduled === 1 ? "отложена" : "отложено"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** «Айгуль Сапарова больше не в команде · передано 2 из 3». */
function goneWords(person: Person, done: number, total: number, how: "pass" | "revoke"): string {
  if (person.role === "tv") return `Экран «${person.full_name}» выключен`;
  const tail = total > 0 ? ` · ${how === "pass" ? "передано" : "отозвано"} ${done} из ${total}` : "";
  return `${person.full_name} больше не в команде${tail}`;
}

/**
 * «Удалить…» (D-160, the owner: «я как директор должен свободно мочь удалить сотрудника»): one
 * word for every person, from every menu, the row's Delete key included. What it does depends on
 * what stands behind the card, and the dialog says it before the button:
 * - nothing (a duplicate, a typo, a test): the card is erased with its login, for good;
 * - a history: the person leaves the team — the login closes on every device, the lists, the
 *   parser's names and the rating forget them, «Ушедшие» in «Команда» keep them; their tasks,
 *   points and reports stay theirs (принцип 4), «Вернуть в команду» brings them back.
 * Open work is handed to one person or taken back — nothing is left hanging on someone who left;
 * the people who answered to them get another manager. Each task goes with its own
 * `client_request_id`, kept for the life of the dialog: a retry cannot give anybody a task twice;
 * a task that did not go stops the removal and is named, the choice is the director's. The
 * secretary sees the numbers (she reads nobody's tasks, D-104) and may still remove — the handover
 * is the director's, from the row of the person who left (`pass`). The wall is switched off the
 * same way, with nothing to hand over.
 */
export function RemoveDialog({
  person,
  roster,
  director,
  mode = "remove",
  onClose,
  onDone,
}: {
  person: Person;
  roster: Person[];
  director: boolean;
  mode?: RemoveMode;
  onClose: () => void;
  /** After the person is out of the team or erased: the card's screen leaves for «Команда». */
  onDone?: (result: "removed" | "erased") => void;
}) {
  const kiosk = person.role === "tv";
  const queryClient = useQueryClient();
  // the history by kind: the dialog says why a card is not erased
  const standing = useStanding(person.id, !kiosk || mode === "erase", true);
  const setWorking = useSetWorking();
  const setManager = useSetManager();
  const erase = useDeletePerson();
  const [how, setHow] = useState<"pass" | "revoke">("pass");
  const [to, setTo] = useState("");
  const subordinates = roster.filter((p) => p.is_active && p.manager_id === person.id && p.id !== person.id);
  const heads = roster
    .filter((p) => p.is_active && p.id !== person.id && (p.role === "manager" || p.role === "director"))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "ru"));
  const ownHead = heads.find((p) => p.id === person.manager_id)?.id ?? "";
  const [nextHead, setNextHead] = useState(ownHead);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<{ failed: Failed<OpenTask>[]; done: number; total: number } | null>(null);
  const done = useRef(0);
  // fixed when the handover starts: the list behind it may refresh while the dialog stands
  const total = useRef(0);
  const requestIds = useRef(new Map<string, string>());

  const data = standing.data;
  const open = data?.open;
  const erasable = data?.deletable === true;
  const history = data?.history ?? null;
  const reading = (!kiosk || mode === "erase") && standing.isPending;
  const movable = director ? (open?.tasks ?? []) : [];
  // erasing takes nothing over: a card with open work has a history and is not erased
  const handing = mode !== "erase" && !erasable && movable.length > 0;
  const missing = handing && how === "pass" && !to;
  const receivers = roster
    .filter((p) => p.is_active && p.role !== "tv" && p.id !== person.id)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "ru"));

  const requestId = (taskId: string) => {
    const known = requestIds.current.get(taskId);
    if (known) return known;
    const fresh = crypto.randomUUID();
    requestIds.current.set(taskId, fresh);
    return fresh;
  };

  // from the toast, after the dialog is gone: a plain write and the shared cache, no hook of this dialog
  const revive = () =>
    void writeWorking(person.id, true).then(
      () => {
        void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
        void queryClient.invalidateQueries({ queryKey: ["roster"] });
        toast(kiosk ? `Экран «${person.full_name}» включён` : `${person.full_name} снова в команде. Вход — по новому коду`);
      },
      (error: unknown) => toast(error instanceof Error ? error.message : "Не получилось вернуть"),
    );

  /** Out of the team: the login closes by itself (`trg_profiles_deactivated`), then the subordinates move. */
  const takeOut = async () => {
    if (mode === "pass") {
      toast(`${how === "pass" ? "Передано" : "Отозвано"} ${done.current} из ${total.current}`);
      onClose();
      return;
    }
    setBusy(true);
    try {
      await setWorking.mutateAsync({ id: person.id, working: false });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не получилось удалить — можно ещё раз");
      setBusy(false);
      return;
    }
    if (subordinates.length > 0) {
      await setManager.mutateAsync({ ids: subordinates.map((p) => p.id), managerId: nextHead || null }).catch((error: unknown) => {
        toast(error instanceof Error ? error.message : "Руководителя у подчинённых сменить не получилось");
      });
    }
    toast(goneWords(person, done.current, total.current, how), { lifetimeMs: 10_000, action: { label: kiosk ? "Включить" : "Вернуть", onClick: revive } });
    onClose();
    onDone?.("removed");
  };

  const eraseNow = () => {
    setBusy(true);
    erase.mutate(person.id, {
      onSuccess: () => {
        toast(`Карточка «${person.full_name}» удалена`);
        onClose();
        onDone?.("erased");
      },
      onError: (error) => {
        toast(error instanceof Error ? error.message : "Не получилось удалить");
        setBusy(false);
      },
    });
  };

  const hand = async (tasks: OpenTask[]) => {
    setBusy(true);
    setLeft(null);
    const result = await passAll(tasks, (task) => (how === "pass" ? reassignTask(task.id, to, requestId(task.id)) : revokeTask(task.id, requestId(task.id))));
    done.current += result.passed.length;
    if (result.passed.length > 0) void queryClient.invalidateQueries({ queryKey: taskKeys.root });
    if (result.failed.length > 0) {
      setLeft({ failed: result.failed, done: done.current, total: total.current });
      setBusy(false);
      return;
    }
    await takeOut();
  };

  const confirm = () => {
    if (mode === "erase") {
      if (erasable) eraseNow();
      else onClose();
      return;
    }
    if (erasable && mode === "remove") {
      eraseNow();
      return;
    }
    if (missing) {
      setTried(true);
      return;
    }
    total.current = handing ? movable.length : 0;
    void (handing ? hand(movable) : takeOut());
  };

  const close = () => {
    if (!busy) onClose();
  };

  const title = mode === "pass" ? "Передать задачи" : kiosk && mode === "remove" ? "Выключить экран" : mode === "erase" ? "Удалить насовсем" : "Удалить сотрудника";
  const action =
    mode === "pass" ? (how === "pass" ? "Передать" : "Отозвать") : mode === "erase" ? (erasable || reading ? "Удалить насовсем" : "Понятно") : kiosk && !erasable ? "Выключить" : "Удалить";
  const danger = mode !== "pass" && !(mode === "erase" && !erasable && !reading);

  /* ---- what stands behind the card ---- */
  const about = (() => {
    if (kiosk && mode === "remove") {
      return <p className="text-[14px] leading-5 text-muted">Экран выйдет из системы. Включить его снова можно из «Ушедших» в «Команде».</p>;
    }
    if (reading) {
      return (
        <p className="text-[14px] leading-5 text-muted" data-testid="remove-reading">
          {mode === "pass" ? "Считаю открытые задачи…" : "Смотрю, что стоит за карточкой…"}
        </p>
      );
    }
    if (mode === "pass") return null;
    if (!data) {
      return (
        <p className="flex flex-wrap items-center gap-2 text-[14px] leading-5 text-muted" data-testid="remove-unknown">
          {mode === "erase"
            ? "Не смог узнать, что стоит за карточкой."
            : "Не смог узнать, что стоит за карточкой. Удалить можно и так: человек уйдёт из команды, его задачи и история останутся."}
          <button type="button" onClick={() => void standing.refetch()} className="font-medium text-text underline-offset-2 hover:underline">
            Повторить
          </button>
        </p>
      );
    }
    if (erasable) {
      return (
        <p className="text-[14px] leading-5 text-muted" data-testid="remove-erase">
          За карточкой нет истории: ни задач, ни сообщений, ни очков. Она исчезнет насовсем вместе со входом, вернуть её будет нельзя.
        </p>
      );
    }
    // the subordinates are this dialog's own question below, not the past
    const kept = (history ?? []).filter((line) => line.label !== "подчинённые");
    const past = kept.length > 0 ? historyWords(kept) : null;
    if (mode === "erase") {
      return (
        <p className="text-[14px] leading-5 text-muted" data-testid="remove-kept">
          Насовсем не стирается: {past ? <>за карточкой история — {past}. </> : "за карточкой есть история. "}
          Без неё не сойдутся отчёты, очки и рейтинг. В команде человека уже нет: в списках, подсказках и рейтинге он не показывается.
        </p>
      );
    }
    return (
      <p className="text-[14px] leading-5 text-muted" data-testid="remove-leave">
        Человек уйдёт из команды: вход закроется на всех устройствах, из списков, подсказок и рейтинга он пропадёт.{" "}
        {past ? <>Его прошлое — {past} — останется под его именем. </> : "Его прошлое останется под его именем. "}
        Вернуть можно из «Ушедших» в «Команде».
      </p>
    );
  })();

  const work =
    mode === "erase" || erasable || kiosk || reading || !open ? null : open.total === 0 ? null : (
      <div className="flex flex-col gap-2.5">
        <div>
          <p className="text-[14px] font-semibold leading-5" data-testid="remove-open">
            {counted(open.total, TASK_FORMS)}
          </p>
          {director ? <p className="text-[13px] leading-[18px] text-muted">{workLine(open)}</p> : null}
        </div>
        {!director ? (
          <p className="text-[14px] leading-5 text-muted" data-testid="remove-secretary">
            Передать или отозвать их может только директор. Удалить можно и сейчас: задачи останутся за человеком, директор увидит их с пометкой «ушёл».
          </p>
        ) : movable.length > 0 ? (
          <>
            <ul className="desk-list max-h-[132px] overflow-y-auto" data-testid="remove-tasks">
              {movable.map((task) => (
                <li key={task.id} className="truncate py-1 text-[13px] leading-5" title={task.title}>
                  {task.title}
                </li>
              ))}
            </ul>
            <div className="self-start">
              <SegmentTabs<"pass" | "revoke">
                aria-label="Что с задачами"
                value={how}
                onChange={setHow}
                items={[
                  { value: "pass", label: "Передать одному" },
                  { value: "revoke", label: "Отозвать" },
                ]}
              />
            </div>
            {how === "pass" ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium leading-5 text-muted">Кому передать</span>
                <Select value={to} onChange={(event) => setTo(event.target.value)} className="w-full" aria-invalid={tried && missing} data-autofocus data-testid="remove-to">
                  <option value="">Выберите человека</option>
                  {receivers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                      {p.availability === "active" ? "" : ` · ${AVAILABILITY_LABEL[p.availability].toLowerCase()}`}
                    </option>
                  ))}
                </Select>
                {tried && missing ? (
                  <span role="alert" className="text-[12px] font-medium leading-4 text-danger" data-testid="form-error">
                    Выберите, кому передать
                  </span>
                ) : null}
              </label>
            ) : (
              <p className="text-[13px] leading-[18px] text-muted" data-testid="remove-revoke-hint">
                Задачи закроются как отозванные — у вас они останутся в «Закрытых».
              </p>
            )}
            {open.review + open.scheduled > 0 ? <p className="text-[13px] leading-[18px] text-muted">Задачи на приёмке и отложенные остаются в «Задачах»: примите их или отзовите там.</p> : null}
          </>
        ) : (
          <p className="text-[13px] leading-[18px] text-muted">Передавать нечего: задачи на приёмке и отложенные остаются в «Задачах» — примите их или отзовите там.</p>
        )}
      </div>
    );

  // who answered to the person: another manager, or none (only when the person leaves for real)
  const team =
    mode === "remove" && !erasable && !reading && subordinates.length > 0 ? (
      <label className="flex flex-col gap-1.5" data-testid="remove-subordinates">
        <span className="text-[13px] font-medium leading-5 text-muted">
          Подчиняются ему: {subordinates.map((p) => p.full_name).join(", ")}. Их руководитель теперь
        </span>
        <Select value={nextHead} onChange={(event) => setNextHead(event.target.value)} className="w-full" data-testid="remove-next-head">
          <option value="">Без руководителя</option>
          {heads.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </Select>
      </label>
    ) : null;

  return (
    <Dialog open onClose={close} title={title} width="sm">
      <div className="flex flex-col gap-4" data-testid="remove-dialog" data-mode={mode}>
        <div className="flex items-center gap-3">
          <Face person={person} size={44} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-5" data-testid="remove-name">
              {person.full_name}
            </p>
            {kiosk ? null : <p className="truncate text-[13px] leading-[18px] text-muted">{roleLine(person)}</p>}
          </div>
        </div>

        {left ? (
          <div className="flex flex-col gap-2" data-testid="remove-partial">
            <p className="text-[14px] font-semibold leading-5">
              {how === "pass" ? "Передано" : "Отозвано"} {left.done} из {left.total}
            </p>
            <ul className="desk-list max-h-[180px] overflow-y-auto">
              {left.failed.map(({ task, reason }) => (
                <li key={task.id} className="py-1.5">
                  <span className="block truncate text-[13px] leading-5" title={task.title}>
                    {task.title}
                  </span>
                  <span className="block text-[12px] leading-4 text-muted">{reason}</span>
                </li>
              ))}
            </ul>
            <Link href={`/desk/tasks?who=${person.id}`} className="self-start text-[13px] font-medium leading-4 text-muted hover:text-text" onClick={onClose}>
              Открыть в «Задачах»
            </Link>
          </div>
        ) : (
          <>
            {about}
            {work}
            {team}
          </>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {left ? (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onClose} data-testid="remove-stop">
                Закрыть
              </Button>
              {mode === "remove" ? (
                <Button size="sm" variant="danger" disabled={busy} onClick={() => void takeOut()} data-testid="remove-anyway">
                  Удалить, оставив их
                </Button>
              ) : null}
              <Button size="sm" loading={busy} onClick={() => void hand(left.failed.map((item) => item.task))} data-testid="remove-retry">
                Повторить
              </Button>
            </>
          ) : (
            <>
              {mode === "erase" && !erasable && !reading ? null : (
                <Button size="sm" variant="ghost" disabled={busy} onClick={onClose} data-testid="remove-cancel">
                  Отмена
                </Button>
              )}
              <Button
                size="sm"
                variant={danger ? "danger" : "primary"}
                loading={busy}
                disabled={reading || (mode === "pass" && movable.length === 0)}
                onClick={confirm}
                data-testid="remove-confirm"
              >
                {action}
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
