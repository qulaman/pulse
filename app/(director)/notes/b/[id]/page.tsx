"use client";

import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { BoardOnWall } from "@/components/mindboard/BoardOnWall";
import { BoardPicker } from "@/components/mindboard/BoardPicker";
import { BoardPresenter } from "@/components/mindboard/BoardPresenter";
import { BoardScreen, type AimKey, type BoardActions, type BoardLines, type Person } from "@/components/mindboard/BoardScreen";
import { carryOver } from "@/components/mindboard/carry";
import { EXTEND_MINUTES, WallSheet } from "@/components/mindboard/WallSheet";
import { AssignSheet } from "@/components/notes/AssignSheet";
import { PeoplePicker } from "@/components/people/PeoplePicker";
import { BoardSkeleton } from "@/components/ui/PageSkeletons";
import { toast } from "@/components/ui/Toast";
import { haptic } from "@/lib/haptics";
import { afterPlace, chainEnd } from "@/lib/mindboard/branch";
import { boardOnWall } from "@/lib/mindboard/list";
import { useBoardMoves } from "@/lib/mindboard/moves";
import type { SplitPoint } from "@/lib/mindboard/split";
import { nextPlaceIn } from "@/lib/mindboard/tree";
import { useBoardRows, useBoardWrites } from "@/lib/mindboard/useBoard";
import { wallBoardOf } from "@/lib/mindboard/wall";
import { useAssignNotes } from "@/lib/notes/assign";
import { useDictation, type Receipt } from "@/lib/notes/dictation";
import { firstLine } from "@/lib/notes/list";
import type { Note } from "@/lib/notes/queries";
import { useSentTasks } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import { firstNameOf } from "@/lib/text/normalize";
import { stageOf } from "@/lib/tv/board";
import { tvKeys, type TvState } from "@/lib/tv/queries";
import { boardExtendTo, boardPointOf, boardViewOf, weekBoardLive } from "@/lib/tv/state";
import { useFlash } from "@/lib/useFlash";
import { useNow } from "@/lib/useNow";
import { useQuietHours } from "@/lib/voice/quietHours";

/** A receipt stays on the screen long enough to be read over the shoulder of a point. */
const RECEIPT_MS = 4_000;
/** A line just given its place reaches the cache within this; past it, the cache is the truth. */
const IN_FLIGHT_MS = 3_000;

const TIME = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Aqtobe" });

const quote = (text: string) => {
  const line = firstLine(text);
  return line.length > 28 ? `${line.slice(0, 27).trimEnd()}…` : line;
};

/** `sub:<point>` / `after:<point>` of the screen's microphone (BoardScreen `AimKey`). */
function aimOf(key: AimKey): { parent: string | null; after: string | null } {
  if (key?.startsWith("sub:")) return { parent: key.slice(4), after: null };
  if (key?.startsWith("after:")) return { parent: null, after: key.slice(6) };
  return { parent: null, after: null };
}

/**
 * A board of «Заметки» (D-102, D-121, D-140) — the data behind `BoardScreen`: the board and
 * its lines from the one notes cache with what still waits on the phone laid over them
 * (D-95), the wall row and the wall as it will draw this board, the screen's one dictaphone,
 * and every write as one mutation. A line is a note underneath: it waits on the phone without
 * network and lands once, its voice is kept before any AI (principle 5).
 */
export default function BoardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  // the board and its lines with what still waits on the phone laid over them (D-95)
  const data = useBoardRows(id);
  const { me, heard, tv, board, rows, phone, owed, late, online } = data;
  const writes = useBoardWrites(me.data);
  const { create, update, remove, rename, deleteBoard, restoreBoard, pin, finish, control, boardControl, weekBoard } = writes;
  const assignMany = useAssignNotes(me.data);
  const hours = useQuietHours();
  const writing = useIsMutating({ mutationKey: ["notes"] }) > 0;
  const now = useNow();
  const openBoard = (boardId: string) => router.push(`/notes/b/${boardId}`);
  const moves = useBoardMoves(data, writes, openBoard, now);

  const [receipt, show] = useFlash<Receipt>(RECEIPT_MS);
  // «Поручить»: the people sheet over the board, the task leaves from here (D-108)
  const [assigning, setAssigning] = useState<Note | null>(null);
  // «Раздать поручения» (D-140): the point whose person is being picked, and what to do with the pick
  const [picking, setPicking] = useState<{ row: Note; then: (person: Person) => void } | null>(null);
  // «Как на стене» (D-140)
  const [wallOpen, setWallOpen] = useState(false);

  // the one microphone of the screen (D-121): whose words it takes is decided when it opens —
  // the status screen says points, «+ подпункт» of an open point says its sub-points, «Пункт
  // ниже» says a point right after it (D-140)
  const aimRef = useRef<AimKey>(null);
  const [aimed, setAimed] = useState<AimKey>(null);
  const aim = useCallback((key: AimKey) => {
    aimRef.current = key;
    setAimed(key);
  }, []);
  // the target of the capture whose words are on their way: the receipt names it
  const captured = useRef<AimKey>(null);

  // a new line goes under the last one of its list — also when two are said before the first lands
  const lastPlace = useRef(new Map<string, number>());
  // and a point said «ниже» goes after the ones already said there (D-140): the places given
  // under each point, and when — a line not in the cache yet is still on its way for a moment
  const lastAfter = useRef(new Map<string, { given: Set<number>; recent: { at: number; when: number }[] }>());
  const rowsRef = useRef(rows);
  useLayoutEffect(() => {
    rowsRef.current = rows;
  });
  const nextPlace = useCallback((parentId: string | null) => {
    const key = parentId ?? "";
    const place = Math.max(nextPlaceIn(rowsRef.current, parentId), (lastPlace.current.get(key) ?? 0) + 1);
    lastPlace.current.set(key, place);
    return place;
  }, []);
  const placeAfter = useCallback((anchor: string) => {
    const rows = rowsRef.current;
    const chain = lastAfter.current.get(anchor) ?? { given: new Set<number>(), recent: [] };
    const now = Date.now();
    const seen = new Set(rows.map((row) => row.position));
    // what still stands under the point, plus what was just given and has not reached the cache
    chain.recent = chain.recent.filter((line) => now - line.when < IN_FLIGHT_MS && !seen.has(line.at));
    const ends = [chainEnd(rows, anchor, chain.given), ...chain.recent.map((line) => line.at)].filter((at): at is number => at !== null);
    const place = afterPlace(rows, anchor, ends.length > 0 ? Math.max(...ends) : null);
    chain.given.add(place);
    chain.recent.push({ at: place, when: now });
    lastAfter.current.set(anchor, chain);
    return place;
  }, []);
  /** Where the next line of this target goes: its parent and its place. */
  const placeOf = useCallback(
    (key: AimKey) => {
      const target = aimOf(key);
      if (target.after) return { parent: null, position: placeAfter(target.after) };
      return { parent: target.parent, position: nextPlace(target.parent) };
    },
    [nextPlace, placeAfter],
  );

  // the dictaphone's receipt: a board says «пункт» / «подпункт», not «сохранено слово в слово»
  const flash = useCallback(
    (next: Receipt) => {
      if (next.eyebrow !== "Записал") return show(next);
      const target = aimOf(captured.current);
      const near = target.parent ?? target.after;
      const row = near ? rowsRef.current.find((line) => line.id === near) : undefined;
      show({ ...next, line: row ? (target.parent ? `Подпункт к «${quote(row.text)}»` : `Пункт после «${quote(row.text)}»`) : "Новый пункт на доске" });
    },
    [show],
  );

  // the place is taken once per capture: parentId() is asked first, nextPosition() right after
  const capturePlace = useRef<{ parent: string | null; position: number } | null>(null);
  const dictation = useDictation(me.data, flash, {
    boardId: id,
    parentId: () => {
      captured.current = aimRef.current;
      capturePlace.current = placeOf(aimRef.current);
      return capturePlace.current.parent;
    },
    nextPosition: () => capturePlace.current?.position ?? nextPlace(null),
  });

  // what a handed-over line became: only when the board holds one
  const handed = rows.some((row) => row.converted_task_id !== null);
  const sent = useSentTasks(handed ? me.data?.userId : undefined);
  const taskById = useMemo(() => new Map((sent.data ?? []).map((task) => [task.id, task])), [sent.data]);

  if (data.loading || !me.data) return <BoardSkeleton />;

  if (!board || board.deleted_at) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-4 pb-28 pt-16 text-center" data-testid="board-missing">
        <Mascot state="calm" size={64} />
        <p className="mt-4 font-display text-[17px] font-semibold">Доски нет</p>
        <p className="mt-1 max-w-[280px] text-[14px] leading-[19px] text-muted">
          {board?.deleted_at ? "Она в корзине — вернуть можно там" : "Возможно, она удалена"}
        </p>
        <Link href="/notes?tab=boards" className="mt-5 text-[15px] font-semibold text-accent">
          К доскам
        </Link>
      </main>
    );
  }

  // the wall (D-121): the board on it, till when, and the point the presenter lit
  const onWall = boardOnWall(tv.data, board.id, now);
  const until = onWall && tv.data?.board_until ? TIME.format(new Date(tv.data.board_until)) : null;
  const spot = onWall ? boardPointOf(tv.data ?? null, now) : null;
  // the wall as it will draw this board (D-140): the preview reads the phone, not the kiosk
  const preview = wallBoardOf(board, rows.filter((row) => !phone.has(row.id)), { view: boardViewOf(tv.data ?? null), focus: spot }, (row) => {
    const task = row.converted_task_id ? taskById.get(row.converted_task_id) : undefined;
    if (!task || task.status === "revoked") return null;
    return { assignee: firstNameOf(task.assignee?.full_name) || null, done: task.status === "done", stage: stageOf(task.status) };
  });

  // tasks handed out after hours wait for the morning (D-38) — unless «сразу»
  const quiet = hours.quiet ? `утром в ${hours.opensAt}` : null;

  const lines: BoardLines = {
    rows,
    phone,
    owed,
    late,
    online,
    hearing: new Set([...dictation.busy, ...heard]),
  };

  const writeOne = (text: string, parent: string | null, position: number) =>
    create.mutate({ id: crypto.randomUUID(), text, client_request_id: crypto.randomUUID(), board_id: board.id, position, parent_id: parent });

  const actions: BoardActions = {
    write: (text, parentId) => {
      writeOne(text, parentId, nextPlace(parentId));
      haptic(10);
      if (parentId === null) show({ tone: "ok", eyebrow: "Записал", headline: firstLine(text), line: "Новый пункт на доске" });
    },
    // a drawing is a point like any other (D-141): it waits on the phone without network and lands once
    writeSketch: (sketch, caption) => {
      create.mutate({
        id: crypto.randomUUID(),
        text: caption,
        client_request_id: crypto.randomUUID(),
        board_id: board.id,
        position: nextPlace(null),
        parent_id: null,
        sketch,
      });
      haptic(10);
      show({ tone: "ok", eyebrow: "Записал", headline: caption || "Рисунок", line: onWall ? "Рисунок на доске — и на стене" : "Рисунок на доске" });
    },
    writeMany: (points: SplitPoint[], at) => {
      // a pasted list under one point: every line of it is a sub-point there
      if (at.parent) {
        const texts = points.flatMap((point) => [point.text, ...point.children]).filter((text) => text.trim());
        for (const text of texts) writeOne(text, at.parent, nextPlace(at.parent));
        haptic(10);
        toast(`${texts.length} ${pluralRu(texts.length, ["подпункт", "подпункта", "подпунктов"])} из списка`);
        return;
      }
      // points in their order (at the bottom or right after a point), each with its sub-points;
      // creates run one after another, so a point lands before its sub-points
      for (const point of points) {
        const pointId = crypto.randomUUID();
        const position = at.after ? placeAfter(at.after) : nextPlace(null);
        create.mutate({ id: pointId, text: point.text, client_request_id: crypto.randomUUID(), board_id: board.id, position, parent_id: null });
        for (const child of point.children) writeOne(child, pointId, nextPlace(pointId));
      }
      haptic(10);
      const subs = points.reduce((sum, point) => sum + point.children.length, 0);
      show({
        tone: "ok",
        eyebrow: "Записал",
        headline: `${points.length} ${pluralRu(points.length, ["пункт", "пункта", "пунктов"])}${subs ? ` · ${subs} ${pluralRu(subs, ["подпункт", "подпункта", "подпунктов"])}` : ""}`,
        line: at.after ? "Встали после пункта" : "Встали в конец доски",
      });
    },
    edit: (row, fields) => update.mutate({ id: row.id, ...fields }),
    remove: (row, words) => remove.mutate({ id: row.id, at: new Date().toISOString(), words }),
    retranscribe: (row) => dictation.retranscribe(row),
    assign: setAssigning,
    spotlight: (pointId) => boardControl.mutate(pointId ? { point: pointId } : { clearPoint: true }),
    // the board goes up for its usual time, then the drawing is lit over the whole wall; the toast
    // waits for the light (a failed one says so itself) and does not promise what a guest hides
    showSketch: (pointId) =>
      control.mutate(
        { board: board.id },
        {
          onSuccess: () =>
            boardControl.mutate(
              { point: pointId },
              {
                onSuccess: (row) =>
                  toast(
                    row.guest && !row.board_guest
                      ? "Доска на стене, но скрыта · гость в кабинете"
                      : row.board_until
                        ? `Рисунок во весь экран · доска на стене до ${TIME.format(new Date(row.board_until))}`
                        : "Рисунок во весь экран",
                  ),
              },
            ),
        },
      ),
    // «Дела исполнителя на стене» (D-144): the person of a handed point, ten minutes over whatever is up
    showPerson: (employeeId, name) =>
      control.mutate({ mode: "employee", employeeId }, { onSuccess: () => toast(name ? `На стене — дела: ${name}, 10 минут` : "На стене — дела исполнителя, 10 минут") }),
    rename: (title) => rename.mutate({ id: board.id, title }),
    deleteBoard: () => {
      const boardId = board.id;
      deleteBoard.mutate({ id: boardId });
      // the screen is leaving: the way back rides in the toast, not in a callback of this page
      toast("Доска в корзине", { action: { label: "Вернуть", onClick: () => restoreBoard.mutate({ id: boardId }) } });
      router.push("/notes?tab=boards");
    },
    aim,
    pin: (on) => {
      pin.mutate({ id: board.id, on });
      toast(on ? "Закрепил сверху списка" : "Открепил");
    },
    finish: (on) => {
      finish.mutate({ id: board.id, on });
      toast(on ? "Доска завершена — она в «Завершённых»" : "Доска снова в работе");
    },
    copyOpen: () => void carryOver(queryClient, me.data, board, openBoard),
    move: moves.move,
    openWall: () => setWallOpen(true),
    pickPerson: (row, then) => setPicking({ row, then }),
    assignMany: async (picks, forceNow) => {
      const result = await assignMany.mutateAsync(picks.map(({ row, person, key }) => ({ note: row, person, forceNow, client_request_id: key })));
      return result.failed.map((input) => input.note.id);
    },
  };

  return (
    <BoardScreen
      board={board}
      lines={lines}
      wall={{ onWall, until, spot, ready: tv.data !== undefined, preview: preview.items.length > 0 ? preview : null }}
      now={now}
      taskOf={(row) => (row.converted_task_id ? taskById.get(row.converted_task_id) : undefined)}
      dictation={dictation}
      aimed={aimed}
      receipt={receipt}
      writing={writing}
      actions={actions}
      quiet={quiet}
      wallButton={<BoardOnWall boardId={board.id} now={now} onHold={() => setWallOpen(true)} onEjected={moves.ejected} />}
      presenter={(points) => <BoardPresenter variant="board" boardId={board.id} points={points} now={now} />}
      sheets={
        <>
          <AssignSheet note={assigning} onClose={() => setAssigning(null)} me={me.data} />
          <PeoplePicker
            open={picking !== null}
            onClose={() => setPicking(null)}
            title="Кому поручить?"
            subject={picking ? firstLine(picking.row.text) : null}
            hideIds={[me.data.userId]}
            onPick={(person) => {
              picking?.then(person);
              setPicking(null);
            }}
          />
          <BoardPicker {...moves.picker} />
          <WallSheet
            open={wallOpen}
            onClose={() => setWallOpen(false)}
            data={preview}
            now={now}
            onWall={onWall}
            until={onWall && tv.data?.board_until ? new Date(tv.data.board_until) : null}
            busy={control.isPending || boardControl.isPending}
            week={{
              can: !board.finished_at,
              on: tv.data?.week_board_id === board.id && weekBoardLive(tv.data ?? null, now),
              taken: tv.data?.week_board_id !== board.id && weekBoardLive(tv.data ?? null, now),
              busy: weekBoard.isPending,
            }}
            onWeek={(on) =>
              weekBoard.mutate(on ? board.id : null, {
                onSuccess: () => toast(on ? "Доска недели — в круге заставок до воскресенья, 21:00" : "Доска ушла из круга заставок"),
              })
            }
            onView={(view) => boardControl.mutate({ view })}
            onShow={(minutes) =>
              control.mutate(
                { board: board.id, ...(minutes ? { boardMinutes: minutes } : {}) },
                { onSuccess: (row) => toast(row.board_until ? `Доска на стене до ${TIME.format(new Date(row.board_until))}` : "Доска на стене") },
              )
            }
            onExtend={() =>
              boardControl.mutate(
                // from the row as the cache holds it this instant: taps in a row add up, a repeat does not
                { until: boardExtendTo(queryClient.getQueryData<TvState | null>(tvKeys.state) ?? null, EXTEND_MINUTES, new Date()).toISOString() },
                { onSuccess: (row) => toast(row.board_until ? `Доска на стене до ${TIME.format(new Date(row.board_until))}` : "Продлил") },
              )
            }
            onEject={() => {
              setWallOpen(false);
              moves.eject();
            }}
          />
        </>
      }
    />
  );
}
