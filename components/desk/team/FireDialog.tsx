"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { SegmentTabs, Select } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { reassignTask, useSetWorking, useStanding } from "@/lib/people/card-queries";
import { passAll, type Failed, type OpenTask, type OpenWork } from "@/lib/people/handover";
import { AVAILABILITY_LABEL, type Person } from "@/lib/people/queries";
import { taskKeys } from "@/lib/tasks/queries";

import { Face, counted, roleLine } from "./shared";

const TASK_FORMS: [string, string, string] = ["открытая задача", "открытые задачи", "открытых задач"];

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

function firedWords(person: Person, passed: number, total: number): string {
  const name = person.full_name;
  if (person.role === "tv") return `Экран «${name}» выключен`;
  return total > 0 ? `${name} больше не работает · передано ${passed} из ${total}` : `${name} больше не работает`;
}

/**
 * «Уволить…» (D-07, the owner's card of 2026-11-04): who, what they have open, and what happens to
 * it — all to one person, or as it is. The director hands over through `reassign_task`, each task
 * with its own `client_request_id`, kept for the life of the dialog: a retry cannot give anybody a
 * task twice. A task that did not go stops the firing and is named, with its reason; the choice
 * is the director's. The secretary sees the number (she reads nobody's tasks, D-104) and may
 * still fire — the handover is the director's, from the row of the person who left (`pass`).
 * The wall is switched off the same way, with nothing to hand over.
 */
export function FireDialog({
  person,
  roster,
  director,
  mode = "fire",
  onClose,
}: {
  person: Person;
  roster: Person[];
  director: boolean;
  /** `pass` — the person has left already: only the handover, nothing about the door. */
  mode?: "fire" | "pass";
  onClose: () => void;
}) {
  const kiosk = person.role === "tv";
  const queryClient = useQueryClient();
  const standing = useStanding(person.id, !kiosk);
  const setWorking = useSetWorking();
  const [how, setHow] = useState<"pass" | "keep">("pass");
  const [to, setTo] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<{ failed: Failed<OpenTask>[]; passed: number; total: number } | null>(null);
  const passed = useRef(0);
  // fixed when the handover starts: the list behind it may refresh while the dialog stands
  const total = useRef(0);
  const requestIds = useRef(new Map<string, string>());

  const open = standing.data?.open;
  const movable = director ? (open?.tasks ?? []) : [];
  const handing = movable.length > 0 && (mode === "pass" || how === "pass");
  const missing = handing && !to;
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

  const finish = async () => {
    if (mode === "pass") {
      toast(`Передано ${passed.current} из ${total.current}`);
      onClose();
      return;
    }
    setBusy(true);
    try {
      await setWorking.mutateAsync({ id: person.id, working: false });
      toast(firedWords(person, passed.current, total.current));
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не получилось уволить — можно ещё раз");
      setBusy(false);
    }
  };

  const hand = async (tasks: OpenTask[]) => {
    setBusy(true);
    setLeft(null);
    const result = await passAll(tasks, (task) => reassignTask(task.id, to, requestId(task.id)));
    passed.current += result.passed.length;
    if (result.passed.length > 0) void queryClient.invalidateQueries({ queryKey: taskKeys.root });
    if (result.failed.length > 0) {
      setLeft({ failed: result.failed, passed: passed.current, total: total.current });
      setBusy(false);
      return;
    }
    await finish();
  };

  const confirm = () => {
    if (missing) {
      setTried(true);
      return;
    }
    total.current = handing ? movable.length : 0;
    void (handing ? hand(movable) : finish());
  };

  const close = () => {
    if (!busy) onClose();
  };

  const title = mode === "pass" ? "Передать задачи" : kiosk ? "Выключить экран" : "Уволить";
  const action = mode === "pass" ? "Передать" : kiosk ? "Выключить" : handing ? "Уволить и передать" : "Уволить";
  const reading = !kiosk && standing.isPending;

  return (
    <Dialog open onClose={close} title={title} width="sm">
      <div className="flex flex-col gap-4" data-testid="fire-dialog">
        <div className="flex items-center gap-3">
          <Face person={person} size={44} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-5" data-testid="fire-name">
              {person.full_name}
            </p>
            {kiosk ? null : <p className="truncate text-[13px] leading-[18px] text-muted">{roleLine(person)}</p>}
          </div>
        </div>

        {mode === "fire" ? (
          <p className="text-[14px] leading-5 text-muted">
            {kiosk
              ? "Экран выйдет из системы. Включить его снова можно здесь же."
              : "Вход закроется на всех устройствах, уведомления перестанут приходить. История останется, вернуть в команду можно в любой момент."}
          </p>
        ) : null}

        {left ? (
          <div className="flex flex-col gap-2" data-testid="fire-partial">
            <p className="text-[14px] font-semibold leading-5">
              Передано {left.passed} из {left.total}
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
        ) : kiosk ? null : reading ? (
          <p className="text-[14px] leading-5 text-muted" data-testid="fire-reading">
            Считаю открытые задачи…
          </p>
        ) : !open ? (
          <p className="flex flex-wrap items-center gap-2 text-[14px] leading-5 text-muted" data-testid="fire-unknown">
            {mode === "fire" ? "Не смог узнать, сколько открытых задач. Уволить можно и так: задачи останутся за человеком." : "Не смог загрузить задачи."}
            <button type="button" onClick={() => void standing.refetch()} className="font-medium text-text underline-offset-2 hover:underline">
              Повторить
            </button>
          </p>
        ) : open.total === 0 ? (
          <p className="text-[14px] leading-5" data-testid="fire-no-tasks">
            Открытых задач нет
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div>
              <p className="text-[14px] font-semibold leading-5" data-testid="fire-open">
                {counted(open.total, TASK_FORMS)}
              </p>
              {director ? <p className="text-[13px] leading-[18px] text-muted">{workLine(open)}</p> : null}
            </div>
            {!director ? (
              <p className="text-[14px] leading-5 text-muted" data-testid="fire-secretary">
                Передать их может только директор. Уволить можно и сейчас: задачи останутся за человеком, пока директор их не передаст.
              </p>
            ) : movable.length > 0 ? (
              <>
                {mode === "fire" ? (
                  <div className="self-start">
                    <SegmentTabs<"pass" | "keep">
                      aria-label="Что с задачами"
                      value={how}
                      onChange={setHow}
                      items={[
                        { value: "pass", label: "Передать одному" },
                        { value: "keep", label: "Оставить как есть" },
                      ]}
                    />
                  </div>
                ) : null}
                {handing ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium leading-5 text-muted">Кому передать</span>
                    <Select value={to} onChange={(event) => setTo(event.target.value)} className="w-full" aria-invalid={tried && missing} data-autofocus data-testid="fire-to">
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
                  <p className="text-[13px] leading-[18px] text-muted">Задачи останутся за человеком: передать их можно потом, из строки в «Команде».</p>
                )}
                {open.review + open.scheduled > 0 ? <p className="text-[13px] leading-[18px] text-muted">Задачи на приёмке и отложенные не передаются: они останутся в «Задачах».</p> : null}
              </>
            ) : (
              <p className="text-[13px] leading-[18px] text-muted">Передать сейчас нечего: задачи на приёмке и отложенные останутся в «Задачах».</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {left ? (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onClose} data-testid="fire-stop">
                Закрыть
              </Button>
              {mode === "fire" ? (
                <Button size="sm" variant="danger" disabled={busy} onClick={() => void finish()} data-testid="fire-anyway">
                  Уволить, оставив их
                </Button>
              ) : null}
              <Button size="sm" loading={busy} onClick={() => void hand(left.failed.map((item) => item.task))} data-testid="fire-retry">
                Повторить
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onClose} data-testid="fire-cancel">
                Отмена
              </Button>
              <Button size="sm" variant={mode === "pass" ? "primary" : "danger"} loading={busy} disabled={reading || (mode === "pass" && !handing)} onClick={confirm} data-testid="fire-confirm">
                {action}
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
