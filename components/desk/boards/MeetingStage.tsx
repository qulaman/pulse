"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { WallFrame } from "@/components/desk/screen/WallFrame";
import { Kbd } from "@/components/desk/ui/Kbd";
import { keysTaken } from "@/components/desk/ui/layers";
import { Avatar } from "@/components/desk/ui/PersonCell";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { usePresenter, VIEW_LABEL } from "@/components/mindboard/BoardPresenter";
import { Button } from "@/components/ui/Button";
import { isTypingTarget } from "@/lib/desk/keys";
import { assignBody, CONFIRM_PATH, facesFor } from "@/lib/mindboard/assignPoint";
import { useAssignNote } from "@/lib/notes/assign";
import { firstLine } from "@/lib/notes/list";
import { useUpdateNote } from "@/lib/notes/mutations";
import type { Note } from "@/lib/notes/queries";
import { dequeue } from "@/lib/outbox";
import { shortName } from "@/lib/people/names";
import { usePeople } from "@/lib/people/queries";
import { forgetHold, holdForUndo, Undone } from "@/lib/tasks/grace";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { SHORT_STATUS } from "@/lib/tasks/status-text";
import { mapHint, nextOpen, presenterWords, type PresenterPoint } from "@/lib/tv/presenter";
import { useTvState } from "@/lib/tv/queries";
import { wallReceipt } from "@/lib/tv/remote";
import { BOARD_VIEWS } from "@/lib/tv/state";

/**
 * «Ведущий» on the desk (D-177): the stage of the meeting beside the compact outline — the live
 * wall in its bezel (`WallFrame`, the very `/tv`), the steps, «Пункт 3 из 10», the point large,
 * «Дальше: …», «Назад · Отметить · Дальше» (←/→ and a clicker's PgUp/PgDn outside a field,
 * Ctrl+Enter ticks and goes on — Space presses the focused button, as anywhere), «Снять подсветку»,
 * «Список · Карта». «Поручить этот пункт»: a row of faces — the people already on this board's
 * tasks, then the latest given tasks — a click sends with five seconds of «Отменить» (D-139's
 * window: the server hears of it only after); «Другой…» opens the usual picker. The commands are
 * the phone's presenter's (`usePresenter`), no new way to the wall.
 */
export function MeetingStage({
  boardId,
  rows,
  points,
  now,
  me,
  taskOf,
  sent,
  onOther,
}: {
  boardId: string;
  rows: Note[];
  points: PresenterPoint[];
  now: Date;
  me: { userId: string };
  taskOf: (row: Note) => TaskWithPeople | undefined;
  /** The director's tasks, newest first — who he gave tasks to lately. */
  sent: TaskWithPeople[];
  onOther: (row: Note) => void;
}) {
  const presenter = usePresenter(boardId, points, now);
  const update = useUpdateNote(me);
  const tv = useTvState();
  const people = usePeople();
  const assign = useAssignNote(me);
  // the line in its five seconds: its face pressed, the others quiet
  const [handing, setHanding] = useState<{ noteId: string; personId: string } | null>(null);

  const { stage, view } = presenter;
  const words = presenterWords(stage);
  const done = stage.kind === "point" && stage.point.done;
  const at = stage.kind === "point" ? stage.at + 1 : 0;
  const row = stage.kind === "point" ? rows.find((line) => line.id === stage.point.id) : undefined;
  const task = row ? taskOf(row) : undefined;
  const subs = row ? rows.filter((line) => line.parent_id === row.id && line.text.trim()).map((line) => firstLine(line.text)) : [];

  const byId = useMemo(() => new Map((people.data ?? []).map((person) => [person.id, person])), [people.data]);
  const faces = useMemo(() => {
    const onBoard = rows.map((line) => (line.converted_task_id ? taskOf(line)?.assignee_id : null));
    const ids = facesFor(onBoard, sent, me.userId, (id) => {
      const person = byId.get(id);
      return Boolean(person && person.is_active && person.role !== "tv");
    });
    return ids.map((id) => byId.get(id)).filter((person) => person !== undefined);
  }, [rows, sent, me.userId, byId, taskOf]);

  /** «Отметить»: the point is ticked and the light goes on to the next open one (D-140). */
  const mark = () => {
    if (stage.kind !== "point") return;
    const ticking = !stage.point.done;
    update.mutate({ id: stage.point.id, done_at: ticking ? new Date().toISOString() : null });
    if (ticking) presenter.goTo(nextOpen(points, stage.point.id));
  };

  const handTo = (note: Note, person: { id: string; full_name: string }) => {
    if (handing) return;
    const crid = crypto.randomUUID();
    setHanding({ noteId: note.id, personId: person.id });
    const who = shortName(person.full_name);
    holdForUndo({ id: crid, path: CONFIRM_PATH, payload: assignBody(note, person, crid), taskId: note.id, text: `Поручаю ${who}: «${firstLine(note.text)}»` })
      .then(() => assign.mutateAsync({ note, person, forceNow: false, client_request_id: crid }))
      .catch((error: unknown) => {
        // taken back: nothing went out, nothing to say; a failure has its toast from the mutation
        if (error instanceof Undone) return;
      })
      .finally(() => {
        // the outbox copy of the window is closed either way: online only, as every «Поручить»
        dequeue(crid);
        forgetHold(crid);
        setHanding(null);
      });
  };

  // the keys lead the meeting — never from a field being typed in, never under a layer
  const keys = useRef<(event: KeyboardEvent) => boolean>(() => false);
  useEffect(() => {
    keys.current = (event) => {
      if (!presenter.onWall || isTypingTarget(event.target) || keysTaken() || event.altKey || event.shiftKey) return false;
      const back = event.code === "ArrowLeft" || event.code === "PageUp";
      const forward = event.code === "ArrowRight" || event.code === "PageDown";
      if ((back || forward) && !event.ctrlKey && !event.metaKey) {
        presenter.step(back ? -1 : 1);
        return true;
      }
      if ((event.ctrlKey || event.metaKey) && (event.code === "Enter" || event.code === "NumpadEnter") && stage.kind === "point") {
        mark();
        return true;
      }
      return false;
    };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (keys.current(event)) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useShortcuts("Ведущий", [
    { keys: ["←", "→"], label: "Прошлый и следующий пункт" },
    { keys: ["PgUp", "PgDn"], label: "То же — кликером для презентаций" },
    { keys: ["Ctrl Enter"], label: "Отметить пункт и дальше" },
    { keys: ["Esc"], label: "Выйти из ведущего" },
  ]);

  const hint = mapHint(points.length);
  const receipt = wallReceipt(tv.data ?? null, now);

  return (
    <section className="board-stage flex min-w-0 flex-col" aria-label="Ведущий" data-testid="board-stage">
      <WallFrame receipt={receipt} />
      {points.length > 0 ? (
        <span aria-hidden className="boards-steps board-stage-steps" style={{ "--steps": points.length } as CSSProperties}>
          {points.map((point, index) => (
            <i key={point.id} data-done={point.done ? "" : undefined} data-here={index + 1 === at ? "" : undefined} />
          ))}
        </span>
      ) : null}
      <p className="mt-3 text-[13px] font-semibold leading-4 text-muted" data-testid="board-stage-step">
        {words.eyebrow}
      </p>
      <p className="board-stage-point mt-1 line-clamp-2" data-done={done ? "" : undefined} aria-live="polite">
        {words.headline}
      </p>
      <p className="mt-1 truncate text-[13px] leading-5 text-muted">
        {words.line}
        {subs.length > 0 ? ` · подпункты: ${subs.join(", ")}` : ""}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Tooltip label="Предыдущий пункт" keys={["←"]}>
          <Button size="sm" variant="secondary" icon={<ChevronLeft aria-hidden size={16} />} disabled={stage.kind !== "point" || stage.at === 0} onClick={() => presenter.step(-1)} data-testid="board-stage-back">
            Назад
          </Button>
        </Tooltip>
        <Tooltip label={done ? "Снять отметку" : "Отметить и дальше"} keys={["Ctrl", "Enter"]}>
          <Button size="sm" variant={done ? "secondary" : "primary"} icon={<Check aria-hidden size={16} />} disabled={stage.kind !== "point"} onClick={mark} data-testid="board-stage-mark">
            {done ? "Отмечен" : "Отметить"}
          </Button>
        </Tooltip>
        <Tooltip label={stage.kind === "point" ? "Следующий пункт" : "С первого пункта"} keys={["→"]}>
          <Button
            size="sm"
            variant="secondary"
            disabled={stage.kind === "empty" || (stage.kind === "point" && stage.next === null)}
            onClick={() => presenter.step(1)}
            data-testid="board-stage-next"
          >
            {stage.kind === "point" ? "Дальше" : "Начать"}
            <ChevronRight aria-hidden size={16} className="-mr-1" />
          </Button>
        </Tooltip>
        <span className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" disabled={stage.kind !== "point"} onClick={presenter.clear}>
            Снять подсветку
          </Button>
          <SegmentTabs aria-label="Вид доски на стене" value={view} onChange={(next) => {
              if (next !== view) presenter.setView(next);
            }} items={BOARD_VIEWS.map((value) => ({ value, label: VIEW_LABEL[value] }))} />
        </span>
      </div>
      {hint ? <p className="mt-1.5 text-[12px] leading-4 text-muted">{hint}</p> : null}

      {row && row.text.trim() ? (
        <div className="board-faces mt-4" data-testid="board-faces">
          {task || row.converted_task_id ? (
            <p className="text-[13px] leading-5 text-muted">
              Поручено: <b className="font-semibold text-text">{shortName(task?.assignee?.full_name) || "исполнителю"}</b>
              {task ? ` · ${SHORT_STATUS[task.status]}` : ""}
            </p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-[13px] leading-5 text-muted">
                <b className="font-semibold text-text">Поручить этот пункт</b> задача уйдёт сразу, «Отменить» — 5 с
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {faces.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className="board-face desk-focus"
                    aria-pressed={handing?.personId === person.id && handing.noteId === row.id}
                    disabled={handing !== null}
                    onClick={() => handTo(row, { id: person.id, full_name: person.full_name })}
                    data-testid="board-face"
                  >
                    <Avatar name={person.full_name} size={24} />
                    {shortName(person.full_name)}
                  </button>
                ))}
                <button type="button" className="board-face desk-focus" disabled={handing !== null} onClick={() => onOther(row)} data-testid="board-face-other">
                  Другой…
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-1.5 text-[12px] leading-4 text-muted">
          <Kbd>→</Kbd> — начать с первого пункта
        </p>
      )}
    </section>
  );
}
