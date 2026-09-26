"use client";

import { onlineManager, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BoardPresenter } from "@/components/mindboard/BoardPresenter";
import { BoardScreen, type BoardActions, type BoardLines } from "@/components/mindboard/BoardScreen";
import { TabBar } from "@/components/TabBar";
import { HeadButton } from "@/components/ui/HeadButton";
import { toast } from "@/components/ui/Toast";
import { nextPlaceIn } from "@/lib/mindboard/tree";
import type { Dictation, DictationStage, Receipt } from "@/lib/notes/dictation";
import { firstLine } from "@/lib/notes/list";
import type { Note } from "@/lib/notes/queries";
import { tvKeys, type TvState } from "@/lib/tv/queries";

import { BOARD_CASES, BOARD_ID, buildBoard, COMPANY, DIRECTOR, wallRow, type BoardCase } from "./fixtures";

const RECEIPT_MS = 4_000;
/** What the sandbox's «STT» hears, in turn. */
const HEARD = ["Позвонить поставщику бетона", "Подготовить отчёт к пятнице", "Собрать цифры по регионам", "Проверить договор аренды"];

/**
 * The dictaphone of the screen without a microphone or a network: the same contract as
 * `useDictation` — press, hold, let go; a tap locks; «Отмена» drops — and a capture becomes a
 * line that is kept, heard («Распознаю…») and gets words a second later.
 */
function useFakeDictation(recording: boolean, onCapture: () => void): Dictation {
  const [stage, setStage] = useState<DictationStage>(recording ? "recording" : "idle");
  const [latched, setLatched] = useState(recording);
  const [startedAt, setStartedAt] = useState<number | null>(() => (recording ? Date.now() - 4_000 : null));
  const [busy] = useState<ReadonlySet<string>>(() => new Set());
  const pressedAt = useRef(0);
  const stopOnRelease = useRef(false);
  const live = useRef({ stage, onCapture });
  useEffect(() => {
    live.current = { stage, onCapture };
  });
  const listeners = useRef(new Set<(level: number) => void>());

  // a voice that rises and falls while the key is down
  useEffect(() => {
    if (stage !== "recording") return;
    const began = performance.now();
    const timer = setInterval(() => {
      const t = (performance.now() - began) / 1000;
      const level = Math.max(0, 0.35 + 0.3 * Math.sin(t * 7) * Math.sin(t * 1.7) + 0.1 * Math.sin(t * 23));
      for (const cb of listeners.current) cb(level);
    }, 50);
    return () => clearInterval(timer);
  }, [stage]);

  const begin = () => {
    setStage("recording");
    setLatched(false);
    setStartedAt(Date.now());
  };
  const finish = () => {
    setStage("saving");
    setLatched(false);
    setStartedAt(null);
    setTimeout(() => {
      setStage("idle");
      live.current.onCapture();
    }, 450);
  };

  return {
    stage,
    latched,
    startedAt,
    busy,
    press() {
      if (live.current.stage === "recording") {
        stopOnRelease.current = true;
        return;
      }
      stopOnRelease.current = false;
      pressedAt.current = Date.now();
      begin();
    },
    release() {
      if (live.current.stage !== "recording") return;
      if (stopOnRelease.current || Date.now() - pressedAt.current >= 350) {
        stopOnRelease.current = false;
        finish();
      } else setLatched(true);
    },
    toggle() {
      if (live.current.stage === "recording") finish();
      else {
        begin();
        setLatched(true);
      }
    },
    cancel() {
      setStage("idle");
      setLatched(false);
      setStartedAt(null);
    },
    retry() {},
    discard() {
      setStage("idle");
    },
    retranscribe() {},
    subscribeLevel(cb) {
      listeners.current.add(cb);
      return () => {
        listeners.current.delete(cb);
      };
    },
  };
}

/**
 * The capsule of the presenter reads the wall row from the query cache, as on the phone. The
 * sandbox seeds that row and keeps it there: without a login a refetch reads nothing, and the
 * sandbox's own row comes back at once.
 */
function useSeededWall(row: TvState | null) {
  const queryClient = useQueryClient();
  const wanted = useRef(row);
  // before the first paint of the capsule
  useState(() => queryClient.setQueryData(tvKeys.state, row));
  useEffect(() => {
    wanted.current = row;
    queryClient.setQueryData(tvKeys.state, row);
  }, [queryClient, row]);
  useEffect(() => {
    const key = JSON.stringify(tvKeys.state);
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || JSON.stringify(event.query.queryKey) !== key) return;
      const data = event.query.state.data as TvState | null | undefined;
      const want = wanted.current;
      if (want && (!data || data.board_id !== want.board_id)) queryClient.setQueryData(tvKeys.state, want);
    });
  }, [queryClient]);
}

/**
 * The real board screen (`BoardScreen`, D-102, D-121) on fixtures: every write changes the
 * fixtures in memory — lines appear, move, go to the bin and come back, the dictaphone «hears»
 * — and nothing reaches the network, the wall or anybody's phone. The presenter's capsule is
 * the real one over a seeded wall row; its ◀ ▶ talk to the server and are refused here — the
 * chips under the board light the points instead.
 */
export function BoardSandbox({ which }: { which: BoardCase }) {
  const now = useMemo(() => new Date(), []);
  const fixture = useMemo(() => buildBoard(which, now), [which, now]);
  const [title, setTitle] = useState(fixture.title);
  const [rows, setRows] = useState<Note[]>(fixture.rows);
  const [hearing, setHearing] = useState<ReadonlySet<string>>(() => new Set(fixture.hearing));
  const [onWall, setOnWall] = useState(fixture.wall.onWall);
  const [spot, setSpot] = useState<string | null>(fixture.wall.spot);
  const [aimed, setAimed] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const aimRef = useRef<string | null>(null);
  const heardCount = useRef(0);

  const wall = useMemo(() => (onWall ? wallRow(now, spot) : null), [onWall, now, spot]);
  useSeededWall(wall);

  // «offline»: the status screen reads the network from TanStack, as on the phone
  useEffect(() => {
    if (fixture.online) return;
    onlineManager.setOnline(false);
    return () => onlineManager.setOnline(true);
  }, [fixture.online]);

  const receiptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((next: Receipt) => {
    if (receiptTimer.current) clearTimeout(receiptTimer.current);
    setReceipt(next);
    receiptTimer.current = setTimeout(() => setReceipt(null), RECEIPT_MS);
  }, []);

  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  });

  const hear = useCallback(
    (id: string, parentId: string | null) => {
      setHearing((set) => new Set(set).add(id));
      setTimeout(() => {
        const words = HEARD[heardCount.current++ % HEARD.length];
        setRows((list) => list.map((row) => (row.id === id && !row.text.trim() ? { ...row, text: words, raw_transcript: words } : row)));
        setHearing((set) => {
          const next = new Set(set);
          next.delete(id);
          return next;
        });
        const parent = parentId ? rowsRef.current.find((row) => row.id === parentId) : undefined;
        show({ tone: "ok", eyebrow: "Записал", headline: words, line: parent ? `Подпункт к «${firstLine(parent.text)}»` : "Новый пункт на доске" });
      }, 1_300);
    },
    [show],
  );

  const add = useCallback((text: string, parentId: string | null, voice: boolean) => {
    const at = new Date().toISOString();
    const id = crypto.randomUUID();
    const row: Note = {
      id,
      company_id: COMPANY,
      user_id: DIRECTOR,
      text,
      raw_transcript: null,
      audio_path: voice ? `${COMPANY}/${DIRECTOR}/${id}.m4a` : null,
      inbox_item_id: null,
      pinned: false,
      board_id: BOARD_ID,
      position: nextPlaceIn(rowsRef.current.filter((note) => note.deleted_at === null), parentId),
      parent_id: parentId,
      done_at: null,
      converted_task_id: null,
      converted_announcement_id: null,
      converted_at: null,
      deleted_at: null,
      remind_at: null,
      reminded_at: null,
      client_request_id: id,
      created_at: at,
      updated_at: at,
    };
    setRows((list) => [...list, row]);
    return id;
  }, []);

  const dictation = useFakeDictation(which === "recording", () => {
    const parentId = aimRef.current;
    hear(add("", parentId, true), parentId);
  });

  const aim = (parentId: string | null) => {
    aimRef.current = parentId;
    setAimed(parentId);
  };

  const edit = (id: string, fields: Partial<Note>) => setRows((list) => list.map((row) => (row.id === id ? { ...row, ...fields } : row)));

  const actions: BoardActions = {
    write: (text, parentId) => {
      add(text, parentId, false);
      if (parentId === null) show({ tone: "ok", eyebrow: "Записал", headline: firstLine(text), line: "Новый пункт на доске" });
    },
    edit: (row, fields) => edit(row.id, fields),
    remove: (row, words) => {
      const stamp = new Date().toISOString();
      setRows((list) => list.map((note) => (note.id === row.id || (note.parent_id === row.id && note.deleted_at === null) ? { ...note, deleted_at: stamp } : note)));
      toast(words.done, {
        action: {
          label: words.undo,
          onClick: () => setRows((list) => list.map((note) => (note.deleted_at === stamp ? { ...note, deleted_at: null } : note))),
        },
      });
    },
    retranscribe: (row) => hear(row.id, row.parent_id),
    assign: (row) => {
      edit(row.id, { converted_task_id: `t-${row.id}` });
      toast("Поручено — в песочнице задача никуда не ушла");
    },
    spotlight: setSpot,
    rename: setTitle,
    deleteBoard: () => toast("Доска в корзине — в песочнице она остаётся"),
    aim,
  };

  const live = rows.filter((row) => row.deleted_at === null);
  const lines: BoardLines = {
    rows: live,
    phone: new Set(fixture.phone),
    owed: new Set(fixture.owed),
    late: new Set(fixture.late),
    online: fixture.online,
    hearing,
  };
  const points = live.filter((row) => row.parent_id === null && row.text.trim());

  return (
    <div className="app-shell flex min-h-dvh flex-col" data-sandbox-case={which}>
      <BoardScreen
        board={{ id: BOARD_ID, title }}
        lines={lines}
        wall={{ onWall, until: onWall && wall?.board_until ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Aqtobe" }).format(new Date(wall.board_until)) : null, spot, ready: true }}
        now={now}
        taskOf={() => undefined}
        dictation={dictation}
        aimed={aimed}
        receipt={receipt}
        writing={false}
        actions={actions}
        wallButton={
          <HeadButton
            label={onWall ? "Убрать доску со стены" : "Показать доску на стене"}
            icon="wall"
            live={onWall}
            testId="board-on-wall"
            onClick={() => {
              setOnWall((was) => !was);
              if (onWall) setSpot(null);
            }}
          />
        }
        presenter={(agenda) => <BoardPresenter variant="board" boardId={BOARD_ID} points={agenda} now={now} />}
        sheets={
          <nav aria-label="Случаи песочницы" className="mt-10 border-t border-border/60 pt-3 text-[13px] leading-5 text-muted" data-testid="sandbox-cases">
            <p className="font-display font-semibold text-accent">/dev/board</p>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {BOARD_CASES.map((item) => (
                <Link key={item} href={`/dev/board?case=${item}`} className={item === which ? "text-text" : ""}>
                  {item}
                </Link>
              ))}
            </p>
            {onWall ? (
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                <span>на стене:</span>
                {points.map((point, index) => (
                  <button key={point.id} type="button" className={spot === point.id ? "text-accent" : ""} onClick={() => setSpot(point.id)}>
                    {index + 1}
                  </button>
                ))}
                <button type="button" onClick={() => setSpot(null)}>
                  снять
                </button>
              </p>
            ) : null}
          </nav>
        }
      />
      <TabBar role="director" />
    </div>
  );
}
